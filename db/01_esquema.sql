-- =====================================================================
-- Dashboard estratégico de TI de Addi · Equipo Nexus
-- 01_esquema.sql · DDL (PostgreSQL 13+)
-- Une las 10 tablas de entrada del "Proceso de generación y simulación"
-- con las 5 tablas de la "Propuesta COBIT". Todo vive en el esquema addi.
-- =====================================================================
DROP SCHEMA IF EXISTS addi CASCADE;
CREATE SCHEMA addi;
SET search_path TO addi;

-- ---------- Configuración y calendario ----------
CREATE TABLE config_global (
    clave        VARCHAR(40) PRIMARY KEY,
    valor        TEXT        NOT NULL,
    version      VARCHAR(10) NOT NULL DEFAULT 'v1.0',
    descripcion  TEXT
);

CREATE TABLE supuestos (
    id        VARCHAR(4) PRIMARY KEY,           -- S1..S12
    supuesto  TEXT NOT NULL,
    valor     TEXT NOT NULL,
    estado    VARCHAR(20) NOT NULL DEFAULT 'Por aprobar'
);

CREATE TABLE calendario_eventos (
    fecha        DATE        NOT NULL,
    evento       VARCHAR(80) NOT NULL,
    tipo         VARCHAR(20) NOT NULL CHECK (tipo IN ('campaña','cierre SFC','festivo','incidente real')),
    factor_carga NUMERIC     NOT NULL DEFAULT 1,
    fuente       TEXT,
    PRIMARY KEY (fecha, evento)
);

-- ---------- COBIT 2019 ----------
CREATE TABLE objetivos_cobit (
    codigo          CHAR(5) PRIMARY KEY,         -- código oficial
    codigo_control  CHAR(5),                     -- código en el Diagnóstico de Control (plantilla docente)
    nombre          VARCHAR(120) NOT NULL,
    dominio         CHAR(3) NOT NULL CHECK (dominio IN ('EDM','APO','BAI','DSS','MEA'))
);

CREATE TABLE diagnostico_awareness (
    objetivo      CHAR(5) PRIMARY KEY REFERENCES objetivos_cobit,
    importancia   SMALLINT NOT NULL CHECK (importancia BETWEEN 1 AND 5),
    desempeno     SMALLINT NOT NULL CHECK (desempeno BETWEEN 1 AND 5),   -- escala ISACA invertida: 1 = muy bien, 5 = mal o no se sabe
    quien         VARCHAR(12) NOT NULL CHECK (quien IN ('TI','Otra área','Tercero','No se sabe')),
    auditado      BOOLEAN NOT NULL,
    formal        BOOLEAN NOT NULL,
    responsable   VARCHAR(80),
    etiqueta_evidencia VARCHAR(2) NOT NULL CHECK (etiqueta_evidencia IN ('V','I','NV')),
    justificacion TEXT
);

-- Nivel de capacidad con historial. Solo recibe cambios aprobados; nunca se edita ni se borra.
CREATE TABLE procesos_madurez (
    id            SERIAL PRIMARY KEY,
    objetivo      CHAR(5) NOT NULL REFERENCES objetivos_cobit,
    version       INT     NOT NULL,
    nivel         SMALLINT NOT NULL CHECK (nivel BETWEEN 0 AND 5),
    etiqueta_evidencia VARCHAR(2) NOT NULL CHECK (etiqueta_evidencia IN ('V','I','NV')),
    etiqueta_dato VARCHAR(12) NOT NULL DEFAULT 'Estimado' CHECK (etiqueta_dato IN ('Real','Estimado','Simulado','Por levantar')),
    fecha         DATE    NOT NULL,
    aprobador     VARCHAR(80) NOT NULL,
    evidencia     TEXT,
    UNIQUE (objetivo, version)
);

CREATE TABLE metas_madurez (                     -- supuesto S5: nivel objetivo entero, fijado por riesgo
    objetivo       CHAR(5) PRIMARY KEY REFERENCES objetivos_cobit,
    nivel_objetivo SMALLINT NOT NULL CHECK (nivel_objetivo BETWEEN 0 AND 5),
    criterio       TEXT NOT NULL
);

CREATE TABLE responsables (
    dominio   CHAR(3) PRIMARY KEY,
    cubre     VARCHAR(60) NOT NULL,
    nombre    VARCHAR(80) NOT NULL,
    correo    VARCHAR(120),
    suplente  VARCHAR(80)
);

CREATE TABLE autoevaluacion (
    seccion        SMALLINT NOT NULL,
    seccion_nombre VARCHAR(60) NOT NULL,
    n              SMALLINT NOT NULL,
    pregunta       TEXT NOT NULL,
    respuesta      VARCHAR(8) NOT NULL CHECK (respuesta IN ('Yes','Partial','No')),
    puntos         SMALLINT NOT NULL,
    etiqueta_evidencia VARCHAR(2),
    comentario     TEXT,
    PRIMARY KEY (seccion, n)
);

CREATE TABLE diagnostico_bsc (                   -- diagnóstico situacional de los 4 elementos (0 a 10)
    elemento   SMALLINT NOT NULL,
    elemento_nombre VARCHAR(40) NOT NULL,
    item       SMALLINT NOT NULL,
    enunciado  TEXT NOT NULL,
    valor      SMALLINT NOT NULL CHECK (valor BETWEEN 0 AND 10),
    PRIMARY KEY (elemento, item)
);

-- ---------- BSC, indicadores y metas ----------
CREATE TABLE objetivos_bsc (
    codigo       VARCHAR(4) PRIMARY KEY,         -- F1, C1, PI1, AC1...
    perspectiva  VARCHAR(30) NOT NULL CHECK (perspectiva IN ('Financiera','Cliente','Procesos internos','Aprendizaje y crecimiento')),
    nombre       TEXT NOT NULL,
    contribuye_a VARCHAR(40)                     -- relaciones causa-efecto del mapa (códigos separados por coma)
);

CREATE TABLE indicadores (
    indicador_id  VARCHAR(8) PRIMARY KEY,        -- código BSC (PI2.2) o número de elemento (47, 24a)
    elemento      SMALLINT,                      -- número en el catálogo del dashboard
    seccion       CHAR(1)  NOT NULL,             -- B..K del catálogo
    pestana       VARCHAR(12) NOT NULL CHECK (pestana IN ('Estrategia','Datos','Seguridad','IA','Operación','COBIT')),
    objetivo_bsc  VARCHAR(4) REFERENCES objetivos_bsc,
    nombre        VARCHAR(90) NOT NULL,
    unidad        VARCHAR(16) NOT NULL,
    sentido       VARCHAR(5) NOT NULL CHECK (sentido IN ('Max','Min','Rango')),
    tipo          VARCHAR(8) NOT NULL DEFAULT 'Lagging' CHECK (tipo IN ('Leading','Lagging')),
    reloj         VARCHAR(10) NOT NULL DEFAULT 'operativo' CHECK (reloj IN ('operativo','plan')),
    clase         SMALLINT NOT NULL CHECK (clase IN (1,2,3)),
    ancla         TEXT NOT NULL,                 -- regla de ancla: nunca en blanco
    formula       TEXT NOT NULL,
    sigma         VARCHAR(20) NOT NULL DEFAULT 'Ninguno',
    rango_min     NUMERIC,
    rango_max     NUMERIC,
    umbral_rojo   NUMERIC,                       -- si existe, el semáforo usa umbrales absolutos
    responsable   VARCHAR(60) NOT NULL,
    fuente        VARCHAR(120) NOT NULL,
    que_mide      TEXT NOT NULL,
    impacto       TEXT,
    decision      TEXT,
    principal     BOOLEAN NOT NULL DEFAULT TRUE  -- FALSE = serie auxiliar (no cuenta en semáforos)
);

CREATE TABLE metas (
    indicador_id VARCHAR(8) NOT NULL REFERENCES indicadores,
    anio         SMALLINT   NOT NULL CHECK (anio BETWEEN 2026 AND 2030),  -- 2026 = línea base
    meta         NUMERIC    NOT NULL,
    origen       VARCHAR(90) NOT NULL,
    PRIMARY KEY (indicador_id, anio)
);

CREATE TABLE iniciativas_plan (
    codigo        VARCHAR(5) PRIMARY KEY,
    accion        TEXT NOT NULL,
    ruta          VARCHAR(30) NOT NULL,
    objetivo_bsc  VARCHAR(4) REFERENCES objetivos_bsc,
    objetivo_cobit CHAR(5) REFERENCES objetivos_cobit,
    responsable   VARCHAR(60) NOT NULL,
    inicio        DATE NOT NULL,
    fin           DATE NOT NULL CHECK (fin > inicio),
    indicador_objetivo VARCHAR(8) REFERENCES indicadores,
    peso_presupuesto NUMERIC NOT NULL,           -- índice: suma 100
    origen        VARCHAR(60) NOT NULL           -- 'documentos' o 'reconstruida (confirmar con hoja Plan)'
);

CREATE TABLE riesgos (
    riesgo_id     VARCHAR(4) PRIMARY KEY,
    riesgo        TEXT NOT NULL,
    categoria     VARCHAR(24) NOT NULL CHECK (categoria IN ('Seguridad y datos','Cumplimiento','Operación','Innovación')),
    objetivo_bsc  VARCHAR(4) REFERENCES objetivos_bsc,
    probabilidad  SMALLINT NOT NULL CHECK (probabilidad BETWEEN 1 AND 3),
    impacto       SMALLINT NOT NULL CHECK (impacto BETWEEN 1 AND 3),
    proceso_cobit CHAR(5) REFERENCES objetivos_cobit,
    dueno         VARCHAR(60),
    indicador_senal VARCHAR(8) REFERENCES indicadores,
    mitigacion    TEXT,
    estado        VARCHAR(16) NOT NULL CHECK (estado IN ('Identificado','En tratamiento','Aceptado','Cerrado')),
    origen        VARCHAR(60) NOT NULL
);

CREATE TABLE apetito_riesgo (                    -- supuesto S6
    categoria  VARCHAR(24) PRIMARY KEY,
    apetito    VARCHAR(12) NOT NULL,
    severidad_max SMALLINT NOT NULL              -- severidad residual máxima tolerada (1 a 9)
);

CREATE TABLE vinculos_objetivo (                 -- conecta cada objetivo COBIT con lo que lo mueve
    id           SERIAL PRIMARY KEY,
    objetivo     CHAR(5) NOT NULL REFERENCES objetivos_cobit,
    indicador_id VARCHAR(8) REFERENCES indicadores,
    accion       VARCHAR(5) REFERENCES iniciativas_plan,
    riesgo_id    VARCHAR(4) REFERENCES riesgos,
    CHECK (num_nonnulls(indicador_id, accion, riesgo_id) = 1)
);

CREATE TABLE modelos_ia (
    modelo_id   VARCHAR(12) PRIMARY KEY,
    nombre      VARCHAR(60) NOT NULL,
    riesgo      VARCHAR(8)  NOT NULL,
    dueno       VARCHAR(60) NOT NULL,
    estado      VARCHAR(30) NOT NULL,
    proxima_revision DATE,
    apagado_rapido BOOLEAN NOT NULL,
    usos_no_permitidos TEXT NOT NULL,
    ancla       TEXT NOT NULL
);

-- ---------- Mediciones (salida del generador). Solo inserción. ----------
CREATE TABLE mediciones (
    indicador_id       VARCHAR(8)  NOT NULL REFERENCES indicadores,
    periodo            DATE        NOT NULL,     -- primer día del mes
    valor              NUMERIC     NOT NULL,
    clase              SMALLINT    NOT NULL CHECK (clase IN (1,2,3)),
    etiqueta           VARCHAR(12) NOT NULL CHECK (etiqueta IN ('Real','Estimado','Simulado','Por levantar')),
    metodo_id          VARCHAR(30) NOT NULL,
    version_parametros VARCHAR(10) NOT NULL,
    semilla            BIGINT,
    fecha_generacion   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (indicador_id, periodo, version_parametros)
);

CREATE TABLE plan_seguimiento (                  -- avance y gasto por acción y mes (reloj del plan)
    codigo      VARCHAR(5) NOT NULL REFERENCES iniciativas_plan,
    periodo     DATE       NOT NULL,
    avance      NUMERIC    NOT NULL CHECK (avance BETWEEN 0 AND 100),   -- % de avance físico
    gasto_plan  NUMERIC    NOT NULL,             -- % del presupuesto de la acción, acumulado
    gasto_real  NUMERIC    NOT NULL,
    etiqueta    VARCHAR(12) NOT NULL DEFAULT 'Simulado',
    PRIMARY KEY (codigo, periodo)
);

-- ---------- Salidas del flujo ----------
CREATE TABLE alertas (
    id           SERIAL PRIMARY KEY,
    corte        DATE NOT NULL,
    indicador_id VARCHAR(8) NOT NULL REFERENCES indicadores,
    que_pasa     TEXT NOT NULL,
    impacto      TEXT NOT NULL,
    que_decidir  TEXT NOT NULL,
    responsable  VARCHAR(60) NOT NULL,
    fecha_limite DATE NOT NULL,
    etiqueta     VARCHAR(12) NOT NULL,
    UNIQUE (corte, indicador_id)
);

CREATE TABLE propuestas_cambio (
    id             SERIAL PRIMARY KEY,
    corte          DATE NOT NULL,
    objetivo       CHAR(5) NOT NULL REFERENCES objetivos_cobit,
    tipo           VARCHAR(10) NOT NULL CHECK (tipo IN ('propuesta','alerta')),
    regla          VARCHAR(20) NOT NULL,
    nivel_actual   SMALLINT,
    nivel_propuesto SMALLINT,
    evidencia      TEXT NOT NULL,
    etiqueta       VARCHAR(12) NOT NULL,          -- hereda la etiqueta más débil de sus entradas
    estado         VARCHAR(12) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada','informativa','caducada')),
    aprobador      VARCHAR(80),
    motivo_rechazo TEXT,
    fecha_decision TIMESTAMPTZ,
    recordatorios  SMALLINT NOT NULL DEFAULT 0,
    CHECK (ABS(COALESCE(nivel_propuesto, nivel_actual) - COALESCE(nivel_actual, 0)) <= 1 OR tipo = 'alerta'),
    UNIQUE (corte, objetivo, regla)
);

CREATE TABLE ejecuciones (
    id         SERIAL PRIMARY KEY,
    fecha      TIMESTAMPTZ NOT NULL DEFAULT now(),
    corte_operativo DATE NOT NULL,
    corte_plan DATE NOT NULL,
    resultado  TEXT NOT NULL
);

CREATE INDEX idx_mediciones_periodo ON mediciones (periodo);
CREATE INDEX idx_madurez_objetivo ON procesos_madurez (objetivo, version DESC);

-- Histórico inmutable: ni las mediciones ni los niveles aprobados se editan o borran.
CREATE FUNCTION fn_solo_insercion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'La tabla % es de solo inserción: genera una versión nueva en lugar de editar.', TG_TABLE_NAME;
END $$;
CREATE TRIGGER tr_mediciones_inmutable BEFORE UPDATE OR DELETE ON mediciones
    FOR EACH ROW EXECUTE FUNCTION fn_solo_insercion();
CREATE TRIGGER tr_madurez_inmutable BEFORE UPDATE OR DELETE ON procesos_madurez
    FOR EACH ROW EXECUTE FUNCTION fn_solo_insercion();
