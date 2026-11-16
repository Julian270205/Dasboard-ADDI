-- =====================================================================
-- 04_funciones.sql · reglas del tablero y del flujo de gobierno COBIT
-- Los flujos de n8n solo llaman estas funciones: la lógica vive en la BD.
-- =====================================================================
SET search_path TO addi;

ALTER TABLE procesos_madurez ADD COLUMN IF NOT EXISTS corrida INT NOT NULL DEFAULT 0;  -- 0 = carga única; >0 = corrida de la demo
INSERT INTO config_global (clave, valor, descripcion) VALUES ('corrida', '1', 'Corrida vigente de la demo (sube al reiniciar)')
ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION fn_cfg(p_clave TEXT) RETURNS TEXT LANGUAGE sql STABLE AS
$$ SELECT valor FROM addi.config_global WHERE clave = p_clave $$;

CREATE OR REPLACE FUNCTION fn_corte(p_reloj TEXT) RETURNS DATE LANGUAGE sql STABLE AS
$$ SELECT addi.fn_cfg('corte_' || p_reloj)::date $$;

CREATE OR REPLACE FUNCTION fn_num(v NUMERIC) RETURNS TEXT LANGUAGE sql IMMUTABLE AS
$$ SELECT replace(trim(trailing '.' FROM trim(trailing '0' FROM to_char(round(v, 2), 'FM999999990.00'))), '.', ',') $$;

-- % de cumplimiento: valor / meta (Max) o meta / valor (Min), con tope de 100 %.
CREATE OR REPLACE FUNCTION fn_cumplimiento(v NUMERIC, meta NUMERIC, sentido TEXT) RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
SELECT CASE
    WHEN v IS NULL OR meta IS NULL OR sentido = 'Rango' THEN NULL
    WHEN sentido = 'Max' THEN CASE WHEN meta <= 0 THEN 100 ELSE LEAST(100, GREATEST(0, round(100 * v / meta, 1))) END
    ELSE CASE WHEN v <= meta THEN 100 WHEN meta <= 0 THEN 0 ELSE LEAST(100, round(100 * meta / v, 1)) END
END $$;

-- Semáforo. Con umbral_rojo usa umbrales absolutos; si no, la regla del BSC (100 / 80 %).
CREATE OR REPLACE FUNCTION fn_semaforo(v NUMERIC, meta NUMERIC, sentido TEXT, rojo NUMERIC, rmin NUMERIC, rmax NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
SELECT CASE
    WHEN v IS NULL OR (meta IS NULL AND sentido <> 'Rango') THEN 'gris'
    WHEN sentido = 'Rango' THEN CASE WHEN v BETWEEN rmin AND rmax THEN 'verde'
                                     WHEN v BETWEEN rmin * 0.8 AND rmax * 1.2 THEN 'amarillo' ELSE 'rojo' END
    WHEN rojo IS NOT NULL AND sentido = 'Max' THEN CASE WHEN v >= meta THEN 'verde' WHEN v < rojo THEN 'rojo' ELSE 'amarillo' END
    WHEN rojo IS NOT NULL AND sentido = 'Min' THEN CASE WHEN v <= meta THEN 'verde' WHEN v > rojo THEN 'rojo' ELSE 'amarillo' END
    WHEN addi.fn_cumplimiento(v, meta, sentido) >= 100 THEN 'verde'
    WHEN addi.fn_cumplimiento(v, meta, sentido) >= 80 THEN 'amarillo'
    ELSE 'rojo'
END $$;

-- Meta al corte: interpola entre la meta del año anterior y la del año en curso (meta "a la fecha").
-- Hasta 2026 aplica la línea base si existe; si no, la meta de 2027.
CREATE OR REPLACE FUNCTION fn_meta(p_ind VARCHAR, p_per DATE) RETURNS NUMERIC LANGUAGE sql STABLE AS $$
WITH a AS (SELECT LEAST(2030, EXTRACT(YEAR FROM p_per)::int) AS y, EXTRACT(MONTH FROM p_per)::numeric AS mes),
     m AS (SELECT (SELECT meta FROM addi.metas WHERE indicador_id = p_ind AND anio = a.y) AS cur,
                  (SELECT meta FROM addi.metas WHERE indicador_id = p_ind AND anio = a.y - 1) AS prev,
                  (SELECT meta FROM addi.metas WHERE indicador_id = p_ind AND anio = 2027) AS m27, a.y, a.mes FROM a)
SELECT CASE WHEN y <= 2026 THEN COALESCE(cur, m27)
            ELSE round(COALESCE(prev, cur) + (cur - COALESCE(prev, cur)) * mes / 12, 2) END FROM m $$;

-- Estado de cada indicador principal en su reloj (p_atras = cortes hacia atrás).
-- La meta es la meta a la fecha del corte (fn_meta).
CREATE OR REPLACE FUNCTION fn_estado(p_atras INT DEFAULT 0)
RETURNS TABLE (indicador_id VARCHAR, periodo DATE, valor NUMERIC, etiqueta VARCHAR, meta NUMERIC, cumplimiento NUMERIC, semaforo TEXT, tendencia TEXT)
LANGUAGE sql STABLE AS $$
WITH base AS (
    SELECT i.*, (addi.fn_corte(i.reloj) - make_interval(months => p_atras))::date AS per
    FROM addi.indicadores i WHERE i.principal
), val AS (
    SELECT b.*, m.valor, m.etiqueta AS etq,
           (SELECT m2.valor FROM addi.mediciones m2 WHERE m2.indicador_id = b.indicador_id AND m2.version_parametros = addi.fn_cfg('version_parametros')
                AND m2.periodo = (b.per - INTERVAL '2 months')::date) AS v2,
           addi.fn_meta(b.indicador_id, b.per) AS meta
    FROM base b LEFT JOIN addi.mediciones m ON m.indicador_id = b.indicador_id AND m.periodo = b.per
         AND m.version_parametros = addi.fn_cfg('version_parametros')
)
SELECT indicador_id, per, valor, etq, meta, addi.fn_cumplimiento(valor, meta, sentido),
       addi.fn_semaforo(valor, meta, sentido, umbral_rojo, rango_min, rango_max),
       CASE WHEN valor IS NULL OR v2 IS NULL THEN 'estable'
            WHEN valor - v2 > GREATEST(abs(v2) * 0.01, 0.005) THEN 'sube'
            WHEN v2 - valor > GREATEST(abs(v2) * 0.01, 0.005) THEN 'baja' ELSE 'estable' END
FROM val $$;

-- Nivel vigente de cada objetivo: última versión de la carga única o de la corrida actual.
CREATE OR REPLACE VIEW v_madurez AS
SELECT DISTINCT ON (objetivo) objetivo, version, nivel, etiqueta_evidencia, etiqueta_dato, fecha, aprobador, evidencia
FROM procesos_madurez
WHERE corrida IN (0, fn_cfg('corrida')::int)
ORDER BY objetivo, version DESC;

-- Elementos 9 y 10: una alerta (y una decisión) por indicador en rojo. Fecha límite = corte + 15 días.
CREATE OR REPLACE FUNCTION fn_recalcular_alertas() RETURNS INT LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
    INSERT INTO addi.alertas (corte, indicador_id, que_pasa, impacto, que_decidir, responsable, fecha_limite, etiqueta)
    SELECT e.periodo, i.indicador_id,
           i.nombre || ': ' || addi.fn_num(e.valor) || ' ' || i.unidad ||
               CASE WHEN i.sentido = 'Rango' THEN ' (rango sano ' || addi.fn_num(i.rango_min) || ' a ' || addi.fn_num(i.rango_max) || ')'
                    ELSE ' frente a la meta de ' || addi.fn_num(e.meta) ||
                         CASE WHEN i.umbral_rojo IS NOT NULL THEN ' (umbral de alerta ' || addi.fn_num(i.umbral_rojo) || ')' ELSE '' END END,
           COALESCE(i.impacto, 'Afecta el objetivo ligado'), COALESCE(i.decision, 'Definir acción correctiva'), i.responsable,
           (e.periodo + INTERVAL '1 month' + INTERVAL '14 days')::date, e.etiqueta
    FROM addi.fn_estado(0) e JOIN addi.indicadores i USING (indicador_id)
    WHERE e.semaforo = 'rojo'
    ON CONFLICT (corte, indicador_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

-- Reglas de propuesta del flujo COBIT. El flujo propone; una persona aprueba.
CREATE OR REPLACE FUNCTION fn_proponer_cambios() RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    v_corte DATE := addi.fn_corte('plan');
    r RECORD; n INT := 0; k INT;
BEGIN
    FOR r IN
        WITH est AS (
            SELECT a.indicador_id, a.semaforo AS s0, b.semaforo AS s1, a.etiqueta
            FROM addi.fn_estado(0) a JOIN addi.fn_estado(1) b USING (indicador_id)
        ), x AS (
            SELECT o.codigo, m.nivel, aw.importancia, aw.desempeno,
                (SELECT count(*) FROM addi.vinculos_objetivo v WHERE v.objetivo = o.codigo AND v.accion IS NOT NULL) AS acc_total,
                (SELECT count(*) FROM addi.vinculos_objetivo v JOIN addi.iniciativas_plan p ON p.codigo = v.accion
                    WHERE v.objetivo = o.codigo AND p.fin <= v_corte) AS acc_listas,
                (SELECT string_agg(v.accion, ', ' ORDER BY v.accion) FROM addi.vinculos_objetivo v WHERE v.objetivo = o.codigo AND v.accion IS NOT NULL) AS acciones,
                (SELECT max(p.fin) FROM addi.vinculos_objetivo v JOIN addi.iniciativas_plan p ON p.codigo = v.accion WHERE v.objetivo = o.codigo) AS ultima_fin,
                (SELECT count(*) FROM addi.vinculos_objetivo v JOIN est e ON e.indicador_id = v.indicador_id
                    WHERE v.objetivo = o.codigo AND NOT (e.s0 = 'verde' AND e.s1 = 'verde')) AS ind_no_verdes,
                (SELECT string_agg(v.indicador_id, ', ' ORDER BY v.indicador_id) FROM addi.vinculos_objetivo v JOIN est e ON e.indicador_id = v.indicador_id
                    WHERE v.objetivo = o.codigo AND e.s0 = 'verde' AND e.s1 = 'verde') AS ind_verdes,
                (SELECT string_agg(v.indicador_id, ', ' ORDER BY v.indicador_id) FROM addi.vinculos_objetivo v JOIN est e ON e.indicador_id = v.indicador_id
                    WHERE v.objetivo = o.codigo AND e.s0 = 'rojo' AND e.s1 = 'rojo') AS ind_rojos,
                (SELECT string_agg(rg.riesgo_id, ', ' ORDER BY rg.riesgo_id) FROM addi.vinculos_objetivo v JOIN addi.riesgos rg ON rg.riesgo_id = v.riesgo_id
                    WHERE v.objetivo = o.codigo AND rg.probabilidad * rg.impacto >= 6 AND COALESCE(rg.acciones, '') = '') AS riesgos_sin_accion,
                (SELECT string_agg(s.codigo, ', ' ORDER BY s.codigo) FROM addi.vinculos_objetivo v JOIN addi.plan_seguimiento s ON s.codigo = v.accion AND s.periodo = v_corte
                    WHERE v.objetivo = o.codigo AND s.gasto_real > 0 AND s.avance / s.gasto_real < 0.9 AND s.avance < 100) AS acc_atrasadas
            FROM addi.objetivos_cobit o
            LEFT JOIN addi.v_madurez m ON m.objetivo = o.codigo
            JOIN addi.diagnostico_awareness aw ON aw.objetivo = o.codigo
        ) SELECT * FROM x
    LOOP
        -- Subir nivel: todas las acciones ligadas completadas e indicadores ligados 2 cortes seguidos en verde.
        IF r.nivel IS NOT NULL AND r.nivel < 5 AND r.acc_total > 0 AND r.acc_listas = r.acc_total AND r.ind_no_verdes = 0
           AND NOT EXISTS (SELECT 1 FROM addi.propuestas_cambio p WHERE p.objetivo = r.codigo AND (p.estado = 'pendiente' OR (p.regla = 'Subir nivel' AND p.corte >= r.ultima_fin))) THEN
            INSERT INTO addi.propuestas_cambio (corte, objetivo, tipo, regla, nivel_actual, nivel_propuesto, evidencia, etiqueta)
            VALUES (v_corte, r.codigo, 'propuesta', 'Subir nivel', r.nivel, r.nivel + 1,
                    'Acciones completadas: ' || r.acciones || '. ' || COALESCE('Indicadores con 2 cortes en verde: ' || r.ind_verdes || '.', 'Sin indicadores ligados: validar con evidencia documental.'),
                    'Simulado')
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
        END IF;
        -- Bajar nivel: un indicador ligado lleva 2 cortes seguidos en rojo.
        IF r.nivel IS NOT NULL AND r.nivel > 0 AND r.ind_rojos IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM addi.propuestas_cambio p WHERE p.objetivo = r.codigo
                           AND (p.estado = 'pendiente' OR (p.regla = 'Bajar nivel' AND p.corte > v_corte - INTERVAL '6 months'))) THEN
            INSERT INTO addi.propuestas_cambio (corte, objetivo, tipo, regla, nivel_actual, nivel_propuesto, evidencia, etiqueta)
            VALUES (v_corte, r.codigo, 'propuesta', 'Bajar nivel', r.nivel, r.nivel - 1,
                    'Indicadores con 2 cortes seguidos en rojo: ' || r.ind_rojos || '.', 'Simulado')
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
        END IF;
        -- Alertas: no cambian el nivel.
        IF r.riesgos_sin_accion IS NOT NULL THEN
            INSERT INTO addi.propuestas_cambio (corte, objetivo, tipo, regla, nivel_actual, evidencia, etiqueta, estado)
            VALUES (v_corte, r.codigo, 'alerta', 'Alerta de riesgo', r.nivel, 'Riesgo crítico sin acción asociada: ' || r.riesgos_sin_accion || '.', 'Estimado', 'informativa')
            ON CONFLICT DO NOTHING;
        END IF;
        IF (r.importancia = 5 AND r.desempeno >= 3) OR r.nivel = 1 THEN
            INSERT INTO addi.propuestas_cambio (corte, objetivo, tipo, regla, nivel_actual, evidencia, etiqueta, estado)
            VALUES (v_corte, r.codigo, 'alerta', 'Alerta de brecha', r.nivel,
                    CASE WHEN r.nivel = 1 THEN 'Proceso en nivel 1' || CASE WHEN r.acc_total = 0 THEN ' y sin ninguna acción del plan.' ELSE '.' END
                         ELSE 'Importancia 5 con desempeño ' || r.desempeno || ' (escala 1 = muy bien).' END, 'Estimado', 'informativa')
            ON CONFLICT DO NOTHING;
        END IF;
        IF r.acc_atrasadas IS NOT NULL THEN
            INSERT INTO addi.propuestas_cambio (corte, objetivo, tipo, regla, nivel_actual, evidencia, etiqueta, estado)
            VALUES (v_corte, r.codigo, 'alerta', 'Alerta de plan', r.nivel, 'Acción del plan atrasada: ' || r.acc_atrasadas || '.', 'Simulado', 'informativa')
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
    RETURN n;
END $$;

-- Decisión humana (pasos 4 y 5). Aprobar crea una versión nueva; rechazar registra el motivo.
CREATE OR REPLACE FUNCTION fn_decidir(p_id INT, p_decision TEXT, p_aprobador TEXT, p_motivo TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE p addi.propuestas_cambio%ROWTYPE; v addi.v_madurez%ROWTYPE;
BEGIN
    SELECT * INTO p FROM addi.propuestas_cambio WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN json_build_object('ok', false, 'mensaje', 'La propuesta no existe.'); END IF;
    IF p.estado <> 'pendiente' THEN RETURN json_build_object('ok', false, 'mensaje', 'La propuesta ya fue ' || p.estado || '.'); END IF;
    IF COALESCE(trim(p_aprobador), '') = '' THEN RETURN json_build_object('ok', false, 'mensaje', 'Falta el nombre del aprobador.'); END IF;
    IF lower(p_decision) IN ('aprobar', 'aprobada') THEN
        SELECT * INTO v FROM addi.v_madurez WHERE objetivo = p.objetivo;
        IF v.nivel <> p.nivel_actual THEN
            UPDATE addi.propuestas_cambio SET estado = 'caducada', fecha_decision = now() WHERE id = p_id;
            RETURN json_build_object('ok', false, 'mensaje', 'El nivel vigente cambió desde que se propuso; la propuesta caducó.');
        END IF;
        INSERT INTO addi.procesos_madurez (objetivo, version, nivel, etiqueta_evidencia, etiqueta_dato, fecha, aprobador, evidencia, corrida)
        VALUES (p.objetivo, (SELECT max(version) + 1 FROM addi.procesos_madurez WHERE objetivo = p.objetivo), p.nivel_propuesto,
                v.etiqueta_evidencia, p.etiqueta, p.corte, p_aprobador, p.regla || ' · ' || p.evidencia, addi.fn_cfg('corrida')::int);
        UPDATE addi.propuestas_cambio SET estado = 'aprobada', aprobador = p_aprobador, fecha_decision = now() WHERE id = p_id;
        RETURN json_build_object('ok', true, 'mensaje', p.objetivo || ' pasa de nivel ' || p.nivel_actual || ' a ' || p.nivel_propuesto || '.');
    ELSIF lower(p_decision) IN ('rechazar', 'rechazada') THEN
        IF COALESCE(trim(p_motivo), '') = '' THEN RETURN json_build_object('ok', false, 'mensaje', 'Para rechazar hay que escribir el motivo.'); END IF;
        UPDATE addi.propuestas_cambio SET estado = 'rechazada', aprobador = p_aprobador, motivo_rechazo = p_motivo, fecha_decision = now() WHERE id = p_id;
        RETURN json_build_object('ok', true, 'mensaje', 'Propuesta rechazada. El nivel de ' || p.objetivo || ' no cambia.');
    END IF;
    RETURN json_build_object('ok', false, 'mensaje', 'Decisión no reconocida: use aprobar o rechazar.');
END $$;

-- Avance del reloj simulado: un mes por ejecución. Si la validación falla, no se mueve.
CREATE OR REPLACE FUNCTION fn_avanzar_corte() RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE
    v_op DATE := (addi.fn_corte('operativo') + INTERVAL '1 month')::date;
    v_pl DATE := (addi.fn_corte('plan') + INTERVAL '1 month')::date;
    v_falt INT; v_al INT; v_pr INT; v_msg TEXT;
BEGIN
    IF addi.fn_cfg('pausado') = 'si' THEN RETURN json_build_object('ok', false, 'mensaje', 'El reloj está pausado.'); END IF;
    IF v_pl > addi.fn_cfg('fin_horizonte')::date THEN RETURN json_build_object('ok', false, 'mensaje', 'Fin del horizonte (diciembre de 2030).'); END IF;
    SELECT count(*) INTO v_falt FROM addi.indicadores i
    WHERE i.principal AND NOT EXISTS (SELECT 1 FROM addi.mediciones m WHERE m.indicador_id = i.indicador_id
            AND m.version_parametros = addi.fn_cfg('version_parametros')
            AND m.periodo = CASE i.reloj WHEN 'plan' THEN v_pl ELSE v_op END);
    IF v_falt > 0 THEN
        v_msg := 'Validación fallida: ' || v_falt || ' indicadores sin medición para el mes nuevo. El reloj no se movió.';
        INSERT INTO addi.ejecuciones (corte_operativo, corte_plan, resultado) VALUES (addi.fn_corte('operativo'), addi.fn_corte('plan'), v_msg);
        RETURN json_build_object('ok', false, 'mensaje', v_msg);
    END IF;
    UPDATE addi.config_global SET valor = v_op::text WHERE clave = 'corte_operativo';
    UPDATE addi.config_global SET valor = v_pl::text WHERE clave = 'corte_plan';
    UPDATE addi.propuestas_cambio SET recordatorios = recordatorios + 1 WHERE estado = 'pendiente';
    v_al := addi.fn_recalcular_alertas();
    v_pr := addi.fn_proponer_cambios();
    v_msg := 'Corte operativo ' || to_char(v_op, 'YYYY-MM') || ' · corte del plan ' || to_char(v_pl, 'YYYY-MM') || ' · ' || v_al || ' alertas nuevas · ' || v_pr || ' propuestas nuevas';
    INSERT INTO addi.ejecuciones (corte_operativo, corte_plan, resultado) VALUES (v_op, v_pl, v_msg);
    RETURN json_build_object('ok', true, 'mensaje', v_msg, 'alertas', v_al, 'propuestas', v_pr);
END $$;

-- Para la presentación: volver al corte inicial. El histórico de niveles se conserva (corrida anterior).
CREATE OR REPLACE FUNCTION fn_reiniciar_demo() RETURNS JSON LANGUAGE plpgsql AS $$
BEGIN
    UPDATE addi.config_global SET valor = addi.fn_cfg('corte_inicial_operativo') WHERE clave = 'corte_operativo';
    UPDATE addi.config_global SET valor = addi.fn_cfg('corte_inicial_plan') WHERE clave = 'corte_plan';
    UPDATE addi.config_global SET valor = (valor::int + 1)::text WHERE clave = 'corrida';
    DELETE FROM addi.propuestas_cambio; DELETE FROM addi.alertas;
    PERFORM addi.fn_recalcular_alertas(); PERFORM addi.fn_proponer_cambios();
    INSERT INTO addi.ejecuciones (corte_operativo, corte_plan, resultado) VALUES (addi.fn_corte('operativo'), addi.fn_corte('plan'), 'Reinicio al corte inicial');
    RETURN json_build_object('ok', true, 'mensaje', 'Demo reiniciada al corte inicial.');
END $$;

-- Pendientes agrupados por dominio para el correo de aprobación (paso 4).
CREATE OR REPLACE FUNCTION fn_pendientes_por_dominio() RETURNS TABLE (dominio CHAR(3), aprobador VARCHAR, correo VARCHAR, suplente VARCHAR, copia_cto BOOLEAN, n BIGINT, detalle TEXT)
LANGUAGE sql STABLE AS $$
SELECT r.dominio, r.nombre, r.correo, r.suplente,
       bool_or(EXISTS (SELECT 1 FROM addi.vinculos_objetivo v JOIN addi.iniciativas_plan a ON a.codigo = v.accion
                       WHERE v.objetivo = p.objetivo AND a.responsable ILIKE '%' || split_part(r.nombre, ' (', 1) || '%')) AND r.dominio <> 'EDM',
       count(*),
       string_agg(p.objetivo || ' ' || o.nombre || ': ' || p.regla || COALESCE(' (' || p.nivel_actual || ' → ' || p.nivel_propuesto || ')', '') || ' · ' || p.evidencia || ' [' || p.etiqueta || '] · id ' || p.id,
                  E'\n' ORDER BY p.objetivo)
FROM addi.propuestas_cambio p JOIN addi.objetivos_cobit o ON o.codigo = p.objetivo JOIN addi.responsables r ON r.dominio = o.dominio
WHERE p.estado = 'pendiente' OR (p.estado = 'informativa' AND p.corte = addi.fn_corte('plan'))
GROUP BY r.dominio, r.nombre, r.correo, r.suplente $$;

-- API del tablero: un solo JSON con todo lo que se muestra.
CREATE OR REPLACE FUNCTION api_dashboard() RETURNS JSON LANGUAGE sql STABLE AS $$
WITH est AS (SELECT * FROM addi.fn_estado(0)),
riesgo AS (
    SELECT r.*, r.probabilidad * r.impacto AS inherente, m.nivel AS nivel_proceso,
           CASE COALESCE(m.nivel, 1) WHEN 0 THEN 0 WHEN 1 THEN 0.2 WHEN 2 THEN 0.4 WHEN 3 THEN 0.6 WHEN 4 THEN 0.7 ELSE 0.8 END AS eficacia,
           a.apetito, a.severidad_max
    FROM addi.riesgos r LEFT JOIN addi.v_madurez m ON m.objetivo = r.proceso_cobit JOIN addi.apetito_riesgo a USING (categoria)
)
SELECT json_build_object(
  'config', (SELECT json_object_agg(clave, valor) FROM addi.config_global),
  'generado', (SELECT max(fecha_generacion) FROM addi.mediciones),
  'consultado', now(),
  'supuestos', (SELECT json_agg(s ORDER BY substr(s.id, 2)::int) FROM addi.supuestos s),
  'objetivos_bsc', (SELECT json_agg(o) FROM addi.objetivos_bsc o),
  'indicadores', (SELECT json_agg(json_build_object(
        'id', i.indicador_id, 'elemento', i.elemento, 'seccion', i.seccion, 'pestana', i.pestana, 'objetivo_bsc', i.objetivo_bsc, 'nombre', i.nombre,
        'unidad', i.unidad, 'sentido', i.sentido, 'tipo', i.tipo, 'reloj', i.reloj, 'clase', i.clase, 'ancla', i.ancla, 'formula', i.formula, 'sigma', i.sigma,
        'rango_min', i.rango_min, 'rango_max', i.rango_max, 'umbral_rojo', i.umbral_rojo, 'responsable', i.responsable, 'fuente', i.fuente,
        'que_mide', i.que_mide, 'principal', i.principal,
        'estado', (SELECT row_to_json(e) FROM est e WHERE e.indicador_id = i.indicador_id),
        'metas', (SELECT json_object_agg(me.anio, me.meta) FROM addi.metas me WHERE me.indicador_id = i.indicador_id),
        'serie', (SELECT json_agg(json_build_array(to_char(m.periodo, 'YYYY-MM'), m.valor, m.etiqueta) ORDER BY m.periodo) FROM addi.mediciones m
                  WHERE m.indicador_id = i.indicador_id AND m.version_parametros = addi.fn_cfg('version_parametros') AND m.periodo <= addi.fn_corte(i.reloj)
                    AND m.periodo > addi.fn_corte(i.reloj) - INTERVAL '36 months'),
        'cobit', (SELECT json_agg(DISTINCT v.objetivo) FROM addi.vinculos_objetivo v WHERE v.indicador_id = i.indicador_id),
        'acciones', (SELECT json_agg(a.codigo) FROM addi.iniciativas_plan a WHERE a.indicador_objetivo = i.indicador_id),
        'riesgos', (SELECT json_agg(r.riesgo_id) FROM addi.riesgos r WHERE r.indicador_senal = i.indicador_id)
      ) ORDER BY i.seccion, i.elemento NULLS LAST, i.indicador_id) FROM addi.indicadores i),
  'cobit', (SELECT json_agg(json_build_object(
        'codigo', o.codigo, 'codigo_control', o.codigo_control, 'nombre', o.nombre, 'dominio', o.dominio,
        'nivel', m.nivel, 'version', m.version, 'etiqueta_evidencia', COALESCE(m.etiqueta_evidencia, aw.etiqueta_evidencia), 'etiqueta_dato', m.etiqueta_dato,
        'evidencia', m.evidencia, 'nivel_objetivo', mm.nivel_objetivo, 'importancia', aw.importancia, 'desempeno', aw.desempeno, 'quien', aw.quien,
        'auditado', aw.auditado, 'formal', aw.formal, 'responsable', aw.responsable, 'justificacion', aw.justificacion,
        'indicadores', (SELECT json_agg(v.indicador_id) FROM addi.vinculos_objetivo v WHERE v.objetivo = o.codigo AND v.indicador_id IS NOT NULL),
        'acciones', (SELECT json_agg(v.accion) FROM addi.vinculos_objetivo v WHERE v.objetivo = o.codigo AND v.accion IS NOT NULL),
        'riesgos', (SELECT json_agg(v.riesgo_id) FROM addi.vinculos_objetivo v WHERE v.objetivo = o.codigo AND v.riesgo_id IS NOT NULL)
      ) ORDER BY array_position(ARRAY['EDM','APO','BAI','DSS','MEA'], o.dominio::text), o.codigo)
      FROM addi.objetivos_cobit o JOIN addi.diagnostico_awareness aw ON aw.objetivo = o.codigo
      LEFT JOIN addi.v_madurez m ON m.objetivo = o.codigo LEFT JOIN addi.metas_madurez mm ON mm.objetivo = o.codigo),
  'historial_madurez', (SELECT COALESCE(json_agg(json_build_object('objetivo', h.objetivo, 'version', h.version, 'nivel', h.nivel, 'fecha', h.fecha,
        'aprobador', h.aprobador, 'evidencia', h.evidencia, 'etiqueta', h.etiqueta_dato,
        'nivel_anterior', (SELECT a.nivel FROM addi.procesos_madurez a WHERE a.objetivo = h.objetivo AND a.version < h.version AND a.corrida IN (0, h.corrida) ORDER BY a.version DESC LIMIT 1))
        ORDER BY h.id DESC), '[]'::json) FROM addi.procesos_madurez h WHERE h.corrida = addi.fn_cfg('corrida')::int),
  'propuestas', (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'corte', to_char(p.corte, 'YYYY-MM'), 'objetivo', p.objetivo, 'nombre', o.nombre, 'dominio', o.dominio,
        'tipo', p.tipo, 'regla', p.regla, 'nivel_actual', p.nivel_actual, 'nivel_propuesto', p.nivel_propuesto, 'evidencia', p.evidencia, 'etiqueta', p.etiqueta,
        'estado', p.estado, 'aprobador', COALESCE(p.aprobador, r.nombre), 'suplente', r.suplente, 'motivo_rechazo', p.motivo_rechazo, 'recordatorios', p.recordatorios,
        'copia_cto', o.dominio <> 'EDM' AND EXISTS (SELECT 1 FROM addi.vinculos_objetivo v JOIN addi.iniciativas_plan a ON a.codigo = v.accion
                       WHERE v.objetivo = p.objetivo AND a.responsable ILIKE '%' || split_part(r.nombre, ' (', 1) || '%'))
        ORDER BY p.id DESC), '[]'::json)
      FROM addi.propuestas_cambio p JOIN addi.objetivos_cobit o ON o.codigo = p.objetivo JOIN addi.responsables r ON r.dominio = o.dominio),
  'responsables', (SELECT json_agg(r) FROM addi.responsables r),
  'autoevaluacion', (SELECT json_agg(a ORDER BY a.seccion, a.n) FROM addi.autoevaluacion a),
  'diagnostico_bsc', (SELECT json_agg(d ORDER BY d.elemento, d.item) FROM addi.diagnostico_bsc d),
  'plan', (SELECT json_agg(json_build_object('codigo', a.codigo, 'accion', a.accion, 'ruta', a.ruta, 'objetivo_bsc', a.objetivo_bsc, 'objetivo_cobit', a.objetivo_cobit,
        'responsable', a.responsable, 'inicio', to_char(a.inicio, 'YYYY-MM'), 'fin', to_char(a.fin, 'YYYY-MM'), 'indicador', a.indicador_objetivo, 'peso', a.peso_presupuesto,
        'origen', a.origen, 'estado_bsc', a.estado_bsc, 'avance', COALESCE(s.avance, 0), 'gasto_plan', COALESCE(s.gasto_plan, 0), 'gasto_real', COALESCE(s.gasto_real, 0),
        'fase', CASE WHEN a.inicio IS NULL THEN 'Sin fechas' WHEN addi.fn_corte('plan') < a.inicio THEN 'No iniciada'
                     WHEN addi.fn_corte('plan') >= a.fin THEN 'Terminada' ELSE 'En curso' END)
        ORDER BY a.inicio NULLS LAST, a.codigo)
      FROM addi.iniciativas_plan a LEFT JOIN addi.plan_seguimiento s ON s.codigo = a.codigo AND s.periodo = addi.fn_corte('plan')),
  'riesgos', (SELECT json_agg(json_build_object('id', r.riesgo_id, 'riesgo', r.riesgo, 'categoria', r.categoria, 'objetivo_bsc', r.objetivo_bsc,
        'probabilidad', r.probabilidad, 'impacto', r.impacto, 'inherente', r.inherente, 'proceso', r.proceso_cobit, 'nivel_proceso', r.nivel_proceso,
        'eficacia', r.eficacia, 'residual', round(r.inherente * (1 - r.eficacia), 1), 'dueno', r.dueno, 'senal', r.indicador_senal,
        'senal_semaforo', (SELECT e.semaforo FROM est e WHERE e.indicador_id = r.indicador_senal),
        'mitigacion', r.mitigacion, 'acciones', r.acciones, 'estado', r.estado, 'apetito', r.apetito, 'severidad_max', r.severidad_max,
        'fuera_apetito', round(r.inherente * (1 - r.eficacia), 1) > r.severidad_max, 'origen', r.origen)
        ORDER BY substr(r.riesgo_id, 2)::int) FROM riesgo r),
  'alertas', (SELECT COALESCE(json_agg(json_build_object('indicador', a.indicador_id, 'corte', to_char(a.corte, 'YYYY-MM'), 'que_pasa', a.que_pasa, 'impacto', a.impacto,
        'que_decidir', a.que_decidir, 'responsable', a.responsable, 'fecha_limite', a.fecha_limite, 'etiqueta', a.etiqueta, 'pestana', i.pestana)
        ORDER BY a.fecha_limite, a.indicador_id), '[]'::json)
      FROM addi.alertas a JOIN addi.indicadores i USING (indicador_id) WHERE a.corte = addi.fn_corte(i.reloj)),
  'modelos_ia', (SELECT json_agg(m) FROM addi.modelos_ia m),
  'calendario', (SELECT json_agg(c ORDER BY c.fecha) FROM addi.calendario_eventos c
                 WHERE c.fecha BETWEEN addi.fn_corte('operativo') - INTERVAL '9 months' AND addi.fn_corte('operativo') + INTERVAL '4 months'),
  'ejecuciones', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT e.fecha, e.resultado FROM addi.ejecuciones e ORDER BY e.id DESC LIMIT 6) x),
  -- Elemento 69 (simulado): cada acción ligada que termina sube 1 nivel, con tope en el nivel objetivo.
  'proyeccion_madurez', (SELECT json_agg(json_build_object('anio', y, 'dominio', d.dominio, 'nivel', d.nivel) ORDER BY y, d.dominio)
      FROM generate_series(2026, 2030) y CROSS JOIN LATERAL (
          SELECT o.dominio, round(avg(LEAST(GREATEST(mm.nivel_objetivo, m.nivel), m.nivel +
                 (SELECT count(*) FROM addi.vinculos_objetivo v JOIN addi.iniciativas_plan a ON a.codigo = v.accion
                  WHERE v.objetivo = o.codigo AND a.fin <= make_date(y, 12, 1)))), 2) AS nivel
          FROM addi.objetivos_cobit o JOIN addi.procesos_madurez m ON m.objetivo = o.codigo AND m.version = 1 JOIN addi.metas_madurez mm ON mm.objetivo = o.codigo
          GROUP BY o.dominio) d)
) $$;

-- Estado inicial: alertas y propuestas del corte de arranque.
SELECT fn_recalcular_alertas() AS alertas_iniciales, fn_proponer_cambios() AS propuestas_iniciales;
