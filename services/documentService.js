// services/documentService.js - VERSIÓN MEJORADA CON PROCESAMIENTO CONCRETO
const { SearchClient, SearchIndexClient, AzureKeyCredential } = require('@azure/search-documents');
const OpenAI = require('openai');
require('dotenv').config();

class DocumentService {
    constructor() {
        if (DocumentService.instance) {
            return DocumentService.instance;
        }
        
        this.searchAvailable = false;
        this.openaiAvailable = false;
        this.initializationError = null;
        this.isAzureOpenAI = true;
        this.embeddingModel = null;
        this.vectorField = 'Embedding';
        this.openaiClient = null;

        // ✅ NUEVO: Configuración optimizada
        // En el constructor (ajusta la config):
this.config = {
  maxContextLength: 12000,
  maxChunkLength: 2000,
  minChunkLength: 20,          // ⬅️ antes 50
  minScoreVector: 0.35,        // ⬅️ nuevo: umbral SOLO para vectorial
  minScoreText: 0.0,           // ⬅️ nuevo: NO filtrar por score en textual
  maxDocumentsPerSearch: 8,
  maxDocumentsPerFile: 2,
  synthesisTemperature: 0.2,
  synthesisMaxTokens: 2500,
  fallbackSummaryLength: 1200
};


        console.log('🔍 Inicializando Document Service Mejorado...');
        this.initializeAzureSearch();
        this.initializeOpenAI();
        
        DocumentService.instance = this;
        console.log(`✅ Document Service v2.0 - Search: ${this.searchAvailable}, OpenAI: ${this.openaiAvailable}`);
    }

    initializeAzureSearch() {
        try {
            const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
            const apiKey = process.env.AZURE_SEARCH_API_KEY;
            const indexName = 'nova';

            if (!endpoint || !apiKey) {
                throw new Error('Variables de Azure Search faltantes (AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY)');
            }

            this.searchClient = new SearchClient(
                endpoint,
                indexName,
                new AzureKeyCredential(apiKey)
            );

            this.indexClient = new SearchIndexClient(
                endpoint,
                new AzureKeyCredential(apiKey)
            );
            
            this.indexName = indexName;
            this.searchAvailable = true;
            
            console.log(`✅ Azure Search configurado correctamente`);
            
        } catch (error) {
            console.error('❌ Error inicializando Azure Search:', error.message);
            this.searchAvailable = false;
            this.initializationError = error.message;
        }
    }

    initializeOpenAI() {
        try {
            const azureOpenaiEndpoint = process.env.OPENAI_ENDPOINT;
            const azureOpenaiKey = process.env.OPENAI_API_KEY;
            
            if (!azureOpenaiEndpoint || !azureOpenaiKey) {
                throw new Error('Variables OPENAI_ENDPOINT y OPENAI_API_KEY requeridas');
            }

            const embeddingDeployment = 'text-embedding-3-large';
            const apiVersion = '2024-02-15-preview';
            const baseURL = `${azureOpenaiEndpoint}/openai/deployments/${embeddingDeployment}`;
            
            this.openaiClient = new OpenAI({
                apiKey: azureOpenaiKey,
                baseURL: baseURL,
                defaultQuery: { 'api-version': apiVersion },
                defaultHeaders: {
                    'api-key': azureOpenaiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            this.embeddingModel = embeddingDeployment;
            this.openaiAvailable = true;
            
            console.log('✅ Azure OpenAI para embeddings configurado');

        } catch (error) {
            console.error('❌ Error inicializando Azure OpenAI:', error.message);
            this.openaiAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * ✅ MÉTODO PRINCIPAL MEJORADO - Procesamiento más concreto y eficiente
     */
    async buscarDocumentos(consulta, userId = 'unknown', options = {}) {
        const startTime = Date.now();
        console.log(`🚀 [${userId}] === BÚSQUEDA DOCUMENTOS MEJORADA v2.0 ===`);
        console.log(`🔍 [${userId}] Query: "${consulta}"`);
        
        if (!this.searchAvailable) {
            return this.crearRespuestaError('Servicio de búsqueda no disponible', this.initializationError);
        }

        try {
            // 1️⃣ Análisis inteligente de la consulta
            const queryAnalysis = this.analizarConsulta(consulta);
            console.log(`🧠 [${userId}] Análisis: tipo=${queryAnalysis.type}, intent=${queryAnalysis.intent}`);

            // 2️⃣ Búsqueda optimizada basada en el análisis
            const documentos = await this.ejecutarBusquedaOptimizada(consulta, queryAnalysis, userId, options);
            
            if (!documentos || documentos.length === 0) {
                console.log(`❌ [${userId}] No se encontraron documentos relevantes`);
                return this.crearRespuestaSinResultados(consulta, queryAnalysis, userId);
            }

            // 3️⃣ Síntesis inteligente y concreta
            const respuestaFinal = await this.sintetizarRespuestaInteligente(
                consulta, 
                documentos, 
                queryAnalysis, 
                userId
            );

            const duration = Date.now() - startTime;
            console.log(`✅ [${userId}] Procesamiento completado en ${duration}ms`);
            
            return respuestaFinal;

        } catch (error) {
            console.error(`❌ [${userId}] Error en búsqueda:`, error.message);
            return this.crearRespuestaError('Error en búsqueda de documentos', error.message);
        }
    }

    /**
     * ✅ NUEVO: Análisis inteligente de consultas
     */
    analizarConsulta(consulta) {
        const queryLower = consulta.toLowerCase().trim();
        const palabras = queryLower.split(/\s+/);
        
        // Detectar tipo de consulta
        let type = 'general';
        let intent = 'info';
        let scope = 'broad';
        let expectedResponseType = 'explanation';

        // Análisis de intención
        if (/^(qué es|que es|define|definir|explicar|explica)/.test(queryLower)) {
            intent = 'definition';
            expectedResponseType = 'definition';
        } else if (/^(cómo|como|de qué manera|pasos)/.test(queryLower)) {
            intent = 'procedure';
            expectedResponseType = 'steps';
        } else if (/^(cuáles|cuales|lista|listar|enumerar)/.test(queryLower)) {
            intent = 'list';
            expectedResponseType = 'list';
        } else if (/^(dónde|donde|ubicar|encontrar)/.test(queryLower)) {
            intent = 'location';
            expectedResponseType = 'reference';
        }

        // Detectar tipo de contenido
        if (['api', 'endpoint', 'servicio', 'método', 'request', 'response'].some(k => queryLower.includes(k))) {
            type = 'api';
            scope = 'technical';
        } else if (['política', 'politica', 'procedimiento', 'proceso', 'regla', 'norma'].some(k => queryLower.includes(k))) {
            type = 'policy';
            scope = 'procedural';
        } else if (['validasocio', 'validación', 'autenticacion', 'token', 'login'].some(k => queryLower.includes(k))) {
            type = 'authentication';
            scope = 'security';
        }

        // Detectar especificidad
        if (palabras.length <= 3) scope = 'focused';
        else if (palabras.length > 8) scope = 'complex';

        return {
            type,
            intent,
            scope,
            expectedResponseType,
            wordCount: palabras.length,
            isQuestion: /^(qué|que|cómo|como|cuál|cual|dónde|donde|cuándo|cuando|por qué|por que)/.test(queryLower),
            keywords: this.extraerPalabrasClaveInteligentes(queryLower)
        };
    }

    /**
     * ✅ NUEVO: Extracción inteligente de palabras clave
     */
    extraerPalabrasClaveInteligentes(queryLower) {
        const stopWords = ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'del', 'las', 'una', 'sobre', 'como', 'cómo'];
        
        return queryLower
            .split(/\s+/)
            .filter(palabra => palabra.length > 2 && !stopWords.includes(palabra))
            .slice(0, 8); // Máximo 8 keywords
    }

    /**
     * ✅ BÚSQUEDA OPTIMIZADA - Estrategia híbrida mejorada
     */
    async ejecutarBusquedaOptimizada(consulta, analysis, userId, options) {
        const config = {
            k: Math.min(options.k || this.config.maxDocumentsPerSearch, 12),
            maxPerFile: options.maxPerFile || this.config.maxDocumentsPerFile,
            minScore: options.minScore || this.config.minScore
        };

        let documentos = [];

        // Estrategia 1: Búsqueda vectorial (prioridad si disponible)
        if (this.openaiAvailable) {
            try {
                console.log(`🔍 [${userId}] Ejecutando búsqueda vectorial...`);
                documentos = await this.busquedaVectorial(consulta, config, userId);
                
                if (documentos.length >= 3) {
                    console.log(`✅ [${userId}] Vectorial exitosa: ${documentos.length} docs`);
                    return this.filtrarYOrdenarDocumentos(documentos, analysis, config);
                }
            } catch (error) {
                console.warn(`⚠️ [${userId}] Búsqueda vectorial falló: ${error.message}`);
            }
        }

        // Estrategia 2: Búsqueda textual mejorada
        try {
            console.log(`🔍 [${userId}] Ejecutando búsqueda textual...`);
            documentos = await this.busquedaTextualMejorada(consulta, analysis, config, userId);
            console.log(`✅ [${userId}] Textual completada: ${documentos.length} docs`);
            
        } catch (error) {
            console.error(`❌ [${userId}] Error en búsqueda textual:`, error.message);
            throw error;
        }

        return this.filtrarYOrdenarDocumentos(documentos, analysis, config);
    }

    /**
     * ✅ BÚSQUEDA VECTORIAL OPTIMIZADA
     */
    async busquedaVectorial(consulta, config, userId) {
        const vector = await this.createEmbedding(consulta);
        
        const searchResults = await this.searchClient.search("*", {
            vectorQueries: [{
                kNearestNeighborsCount: config.k * 3, // Obtener más para filtrar mejor
                fields: this.vectorField,
                vector: vector
            }],
            select: ['Chunk', 'FileName', 'Folder'],
            top: config.k * 4,
            includeTotalCount: true
        });

        return await this.procesarResultadosBusqueda(searchResults, config, userId, 'vectorial');
    }

    /**
     * ✅ BÚSQUEDA TEXTUAL MEJORADA - Con query expansion
     */
    async busquedaTextualMejorada(consulta, analysis, config, userId) {
  const queryOptimizada = this.optimizarQueryTextual(consulta, analysis);

  const searchResults = await this.searchClient.search(queryOptimizada, {
    select: ['Chunk', 'FileName', 'Folder', 'Estado'],  // ⬅️ añade Estado si puede ayudar
    top: config.k * 4,
    searchMode: 'all',       // ⬅️ antes any
    queryType: 'full',       // ⬅️ antes simple
    searchFields: ['Chunk', 'FileName', 'Folder'] // ⬅️ amplía campos
    // Si tu servicio lo soporta, podrías probar:
    // queryLanguage: 'es-es',
    // speller: 'lexicon'
  });

  return await this.procesarResultadosBusqueda(searchResults, config, userId, 'textual');
}


    /**
     * ✅ OPTIMIZACIÓN DE QUERY TEXTUAL
     */
    optimizarQueryTextual(consulta, analysis) {
  let q = this.sanitizeQuery(consulta);

  // refuerza términos si parecen políticas/procedimientos
  if (/(pol[ií]tica|procedimiento|regla|norma)/i.test(q) === false) {
    if (analysis.type === 'policy' || /prestamo|pr[eé]stamo/i.test(q)) {
      q += ' politica procedimiento reglas';
    }
  }

  // elimina underscores que no suman en textual
  q = q.replace(/_/g, ' ');

  return q.trim();
}


    /**
     * ✅ PROCESAMIENTO MEJORADO DE RESULTADOS
     */
    // Cambia la firma de procesarResultadosBusqueda para recibir el tipo:
async procesarResultadosBusqueda(searchResults, config, userId, tipoSearch) {
  const documentos = [];
  const archivosCounts = new Map();
  let procesados = 0;

  const minScore = tipoSearch === 'vectorial' ? (config.minScoreVector ?? 0.35) : (config.minScoreText ?? 0.0);

  try {
    for await (const result of searchResults.results) {
      procesados++;

      const doc = result.document || {};
      const score = Number(result.score || 0);
      const fileName = doc.FileName || '(sin nombre)';
      const rawChunk = (doc.Chunk || '').trim();

      // ✅ Filtro de chunk y score más flexible
      if (!this.esChunkValido(rawChunk, score, { ...config, minScore: minScore }, tipoSearch)) continue;

      const fileCount = archivosCounts.get(fileName) || 0;
      if (fileCount >= config.maxPerFile) continue;
      archivosCounts.set(fileName, fileCount + 1);

      const cleanChunk = this.limpiarYOptimizarChunk(rawChunk);
      const quality = this.evaluarCalidadChunkMejorada(cleanChunk, score, fileName);

      documentos.push({
        fileName,
        folder: doc.Folder || '',
        chunk: cleanChunk,
        score,
        quality,
        relevanceScore: (score * 0.7) + (quality * 0.3),
        searchType: tipoSearch,
        length: cleanChunk.length
      });

      if (documentos.length >= config.k) break;
    }

    console.log(`📊 [${userId}] ${tipoSearch}: procesados=${procesados}, seleccionados=${documentos.length}`);
    return documentos;

  } catch (error) {
    console.error(`❌ [${userId}] Error procesando resultados ${tipoSearch}:`, error.message);
    return [];
  }
}


    /**
     * ✅ VALIDACIÓN MEJORADA DE CHUNKS
     */
    // Ajusta esChunkValido para considerar el tipo:
esChunkValido(chunk, score, config, tipoSearch) {
  if (!chunk) return false;
  if (chunk.length < (config.minChunkLength ?? 20)) return false;
  if (chunk.length > (this.config.maxChunkLength ?? 2000)) return false;

  // Solo aplica score mínimo en vectorial
  if (tipoSearch === 'vectorial' && score > 0 && score < (config.minScore ?? 0.35)) return false;

  const chunkLower = chunk.toLowerCase();
  const filtrosExclusion = [
    'índice',
    'tabla de contenido',
    'footer',
    'header',
    /^\d+\s*$/,
    /^[^\w\s]{5,}/,
  ];
  return !filtrosExclusion.some(f => typeof f === 'string' ? chunkLower.includes(f) : f.test(chunk));
}

    /**
     * ✅ EVALUACIÓN DE CALIDAD MEJORADA
     */
    evaluarCalidadChunkMejorada(chunk, score, fileName) {
        let quality = 0;
        const chunkLower = chunk.toLowerCase();
        
        // Factor 1: Longitud apropiada (0-0.25)
        const length = chunk.length;
        if (length >= 100 && length <= 1500) quality += 0.25;
        else if (length >= 50 && length < 100) quality += 0.15;
        else if (length > 1500 && length <= 2000) quality += 0.20;

        // Factor 2: Estructura informativa (0-0.3)
        const structureIndicators = [':', '•', '-', '\n', '1.', '2.', 'API', 'método', 'parámetro'];
        const structureCount = structureIndicators.filter(indicator => chunk.includes(indicator)).length;
        quality += Math.min(structureCount * 0.05, 0.3);

        // Factor 3: Contenido técnico relevante (0-0.25)
        const technicalTerms = ['api', 'endpoint', 'servicio', 'parámetro', 'respuesta', 'request', 'json', 'http', 'get', 'post'];
        const techCount = technicalTerms.filter(term => chunkLower.includes(term)).length;
        quality += Math.min(techCount * 0.04, 0.25);

        // Factor 4: Calidad del archivo fuente (0-0.2)
        if (fileName) {
            const fileNameLower = fileName.toLowerCase();
            if (fileNameLower.includes('api') || fileNameLower.includes('manual') || fileNameLower.includes('doc')) {
                quality += 0.2;
            } else if (!fileNameLower.includes('tmp') && !fileNameLower.includes('temp')) {
                quality += 0.1;
            }
        }

        return Math.min(quality, 1.0);
    }

    /**
     * ✅ LIMPIEZA Y OPTIMIZACIÓN DE CHUNKS
     */
    limpiarYOptimizarChunk(chunk) {
        return chunk
            .replace(/\s+/g, ' ')           // Normalizar espacios
            .replace(/\n{3,}/g, '\n\n')     // Limitar saltos de línea
            .replace(/[^\w\s\n.,;:()\-áéíóúñü¿?¡!]/gi, '') // Mantener caracteres útiles
            .trim();
    }

    /**
     * ✅ FILTRADO Y ORDENAMIENTO FINAL
     */
    filtrarYOrdenarDocumentos(documentos, analysis, config) {
        // Ordenar por relevancia combinada
        documentos.sort((a, b) => b.relevanceScore - a.relevanceScore);
        
        // Aplicar filtros específicos según el análisis
        let documentosFiltrados = documentos;
        
        if (analysis.scope === 'focused') {
            // Para consultas enfocadas, priorizar alta relevancia
            documentosFiltrados = documentos.filter(doc => doc.relevanceScore > 0.7);
        }
        
        if (analysis.type === 'api') {
            // Para APIs, priorizar contenido técnico
            documentosFiltrados = documentos.filter(doc => 
                doc.chunk.toLowerCase().includes('api') || 
                doc.chunk.toLowerCase().includes('endpoint') ||
                doc.quality > 0.6
            );
        }

        return documentosFiltrados.slice(0, config.k);
    }

    /**
     * ✅ SÍNTESIS INTELIGENTE Y CONCRETA - Versión mejorada
     */
    async sintetizarRespuestaInteligente(consulta, documentos, analysis, userId) {
        console.log(`🧠 [${userId}] Síntesis inteligente: ${documentos.length} docs, tipo=${analysis.type}`);

        if (!this.openaiAvailable) {
            return this.sintetizarRespuestaFallbackMejorada(consulta, documentos, analysis, userId);
        }

        try {
            const contexto = this.construirContextoOptimizadoV2(documentos, analysis);
            const prompt = this.crearPromptInteligente(consulta, contexto, analysis);

            const response = await this.openaiClient.chat.completions.create({
                model: 'gpt-5-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: this.config.synthesisTemperature,
                max_tokens: this.config.synthesisMaxTokens,
                top_p: 0.9
            });

            let respuestaSintetizada = response.choices?.[0]?.message?.content?.trim();
            
            if (!respuestaSintetizada || respuestaSintetizada.length < 100) {
                console.warn(`⚠️ [${userId}] Respuesta OpenAI insuficiente, usando fallback`);
                return this.sintetizarRespuestaFallbackMejorada(consulta, documentos, analysis, userId);
            }

            // ✅ POSTPROCESAMIENTO DE LA RESPUESTA
            respuestaSintetizada = this.postprocesarRespuesta(respuestaSintetizada, documentos, analysis);
            
            console.log(`✅ [${userId}] Síntesis inteligente completada (${respuestaSintetizada.length} chars)`);
            return respuestaSintetizada;

        } catch (error) {
            console.error(`❌ [${userId}] Error en síntesis inteligente:`, error.message);
            return this.sintetizarRespuestaFallbackMejorada(consulta, documentos, analysis, userId);
        }
    }

    /**
     * ✅ CONTEXTO OPTIMIZADO V2 - Más inteligente
     */
    construirContextoOptimizadoV2(documentos, analysis) {
        let contexto = '';
        let currentLength = 0;
        const maxLength = this.config.maxContextLength;

        // Agrupar por relevancia y diversidad
        const documentosAgrupados = this.agruparDocumentosPorRelevancia(documentos);

        documentosAgrupados.forEach((doc, index) => {
            if (currentLength >= maxLength) return;

            const header = `DOCUMENTO ${index + 1} - ${doc.fileName} (Relevancia: ${(doc.relevanceScore * 100).toFixed(1)}%):\n`;
            const content = doc.chunk;
            
            const maxChunkLength = Math.min(
                this.config.maxChunkLength, 
                maxLength - currentLength - header.length - 50
            );

            const truncatedContent = content.length > maxChunkLength 
                ? content.substring(0, maxChunkLength) + '...[truncado]'
                : content;

            const docSection = `${header}${truncatedContent}\n\n`;
            
            if (currentLength + docSection.length <= maxLength) {
                contexto += docSection;
                currentLength += docSection.length;
            }
        });

        return contexto;
    }

    /**
     * ✅ AGRUPACIÓN INTELIGENTE DE DOCUMENTOS
     */
    agruparDocumentosPorRelevancia(documentos) {
        // Evitar duplicación y promover diversidad
        const vistos = new Set();
        const resultado = [];

        for (const doc of documentos) {
            const firma = this.generarFirmaDocumento(doc.chunk);
            
            if (!vistos.has(firma)) {
                vistos.add(firma);
                resultado.push(doc);
            }
        }

        return resultado;
    }

    /**
     * ✅ GENERAR FIRMA ÚNICA PARA EVITAR DUPLICADOS
     */
    generarFirmaDocumento(chunk) {
        return chunk
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .substring(0, 200)
            .replace(/[^\w\s]/g, '');
    }

    /**
     * ✅ PROMPT INTELIGENTE PERSONALIZADO
     */
    crearPromptInteligente(consulta, contexto, analysis) {
        const tipoRespuesta = this.determinarTipoRespuesta(analysis);
        
        return `Eres NOVA-AI, asistente especializado en documentación de Nova Corporation.

CONSULTA DEL USUARIO: "${consulta}"

TIPO DE RESPUESTA REQUERIDA: ${tipoRespuesta}

DOCUMENTOS ENCONTRADOS:
${contexto}

INSTRUCCIONES ESPECÍFICAS:
1. Responde SIEMPRE en español
2. Sé CONCRETO y DIRECTO - evita información redundante
3. Usa MARKDOWN para estructura clara
4. ${this.obtenerInstruccionesEspecificas(analysis)}
5. Incluye solo información DIRECTAMENTE relevante
6. Máximo 2000 caracteres para mantener concisión

FORMATO ESPERADO:
${this.obtenerFormatoEsperado(analysis)}

Proporciona una respuesta precisa, concreta y bien estructurada.`;
    }

    /**
     * ✅ DETERMINACIÓN DE TIPO DE RESPUESTA
     */
    determinarTipoRespuesta(analysis) {
        const tiposRespuesta = {
            definition: 'Definición clara y concisa',
            procedure: 'Lista de pasos ordenados',
            list: 'Lista estructurada de elementos',
            technical: 'Explicación técnica detallada',
            reference: 'Información de referencia específica'
        };

        return tiposRespuesta[analysis.expectedResponseType] || 'Respuesta informativa completa';
    }

    /**
     * ✅ INSTRUCCIONES ESPECÍFICAS POR TIPO
     */
    obtenerInstruccionesEspecificas(analysis) {
        switch (analysis.type) {
            case 'api':
                return 'Enfócate en endpoints, parámetros, y ejemplos de uso';
            case 'policy':
                return 'Resalta reglas, procedimientos y requisitos clave';
            case 'authentication':
                return 'Describe pasos de autenticación y validaciones';
            default:
                return 'Proporciona la información más relevante y útil';
        }
    }

    /**
     * ✅ FORMATO ESPERADO POR TIPO
     */
    obtenerFormatoEsperado(analysis) {
        switch (analysis.expectedResponseType) {
            case 'steps':
                return '## Procedimiento\n1. Paso uno\n2. Paso dos\n...';
            case 'list':
                return '## Lista\n• Elemento 1\n• Elemento 2\n...';
            case 'definition':
                return '## Definición\n[Explicación concisa]\n\n## Detalles\n[Información adicional]';
            default:
                return '## Respuesta\n[Información estructurada y clara]';
        }
    }

    /**
     * ✅ POSTPROCESAMIENTO DE RESPUESTA
     */
    postprocesarRespuesta(respuesta, documentos, analysis) {
        // Agregar metadatos útiles
        const fuentes = [...new Set(documentos.map(d => d.fileName))].slice(0, 3);
        const avgRelevance = documentos.reduce((sum, doc) => sum + doc.relevanceScore, 0) / documentos.length;
        
        respuesta += `\n\n---\n\n`;
        respuesta += `📚 **Fuentes**: ${fuentes.join(', ')}${fuentes.length < documentos.length ? ` y ${documentos.length - fuentes.length} más` : ''}`;
        respuesta += `\n🎯 **Relevancia promedio**: ${(avgRelevance * 100).toFixed(1)}%`;
        respuesta += `\n🤖 **Procesado con**: Azure AI Search + OpenAI (Síntesis Inteligente v2.0)`;

        return respuesta;
    }

    /**
     * ✅ FALLBACK MEJORADO - Sin OpenAI
     */
    sintetizarRespuestaFallbackMejorada(consulta, documentos, analysis, userId) {
        console.log(`🔄 [${userId}] Usando síntesis fallback mejorada`);

        let respuesta = `🔍 **${analysis.intent === 'definition' ? 'Definición' : 'Información'} sobre: "${consulta}"**\n\n`;

        // Procesar documentos por relevancia
        const documentosOrdenados = documentos
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 3);

        documentosOrdenados.forEach((doc, index) => {
            const numeroEmoji = ['1️⃣', '2️⃣', '3️⃣'][index];
            
            respuesta += `${numeroEmoji} **${doc.fileName}** (${(doc.relevanceScore * 100).toFixed(1)}% relevancia)\n\n`;
            
            // Resumen inteligente del contenido
            const resumen = this.crearResumenInteligente(doc.chunk, analysis);
            respuesta += `${resumen}\n\n`;
        });

        // Agregar análisis de cobertura
        const cobertura = this.analizarCoberturaBusqueda(documentos, analysis);
        respuesta += `📊 **Análisis de cobertura**: ${cobertura}\n\n`;

        // Metadatos
        respuesta += `---\n\n`;
        respuesta += `📁 **Documentos procesados**: ${documentos.length}`;
        respuesta += `\n🎯 **Tipo de búsqueda**: ${documentos[0]?.searchType || 'textual'}`;
        respuesta += `\n🔧 **Método**: Síntesis automática (sin IA)`;

        return respuesta;
    }

    /**
     * ✅ RESUMEN INTELIGENTE SIN IA
     */
    crearResumenInteligente(chunk, analysis) {
        const maxLength = this.config.fallbackSummaryLength;
        
        if (chunk.length <= maxLength) {
            return chunk;
        }

        // Extraer las primeras oraciones más relevantes
        const oraciones = chunk.split(/[.!?]+/).filter(s => s.trim().length > 20);
        
        if (analysis.expectedResponseType === 'steps') {
            // Para procedimientos, buscar pasos numerados
            const pasos = oraciones.filter(s => 
                /^\s*\d+[.)]\s/.test(s) || 
                /^\s*(paso|step|primera|segundo|tercero)/i.test(s)
            );
            
            if (pasos.length > 0) {
                return pasos.slice(0, 5).join('. ').substring(0, maxLength) + (pasos.length > 5 ? '...' : '');
            }
        }

        if (analysis.expectedResponseType === 'list') {
            // Para listas, buscar elementos enumerados
            const elementos = oraciones.filter(s => 
                /^\s*[•\-*]\s/.test(s) || 
                /^\s*(incluye|contiene|son)/i.test(s)
            );
            
            if (elementos.length > 0) {
                return elementos.slice(0, 4).join('. ').substring(0, maxLength) + (elementos.length > 4 ? '...' : '');
            }
        }

        // Resumen general: primeras oraciones más informativas
        const oracionesRelevantes = oraciones
            .filter(s => s.length > 30 && s.length < 200)
            .slice(0, 3);

        return oracionesRelevantes.join('. ').substring(0, maxLength) + '...';
    }

    /**
     * ✅ ANÁLISIS DE COBERTURA DE BÚSQUEDA
     */
    analizarCoberturaBusqueda(documentos, analysis) {
        const tipos = [...new Set(documentos.map(d => d.searchType))];
        const archivos = [...new Set(documentos.map(d => d.fileName))];
        const relevanciaPromedio = documentos.reduce((sum, doc) => sum + doc.relevanceScore, 0) / documentos.length;
        
        let cobertura = `${tipos.join(' + ')} en ${archivos.length} archivo(s)`;
        
        if (relevanciaPromedio > 0.8) cobertura += ' (alta precisión)';
        else if (relevanciaPromedio > 0.6) cobertura += ' (precisión media)';
        else cobertura += ' (precisión básica)';
        
        return cobertura;
    }

    /**
     * ✅ RESPUESTAS DE ERROR MEJORADAS
     */
    crearRespuestaError(titulo, detalle) {
        return `❌ **${titulo}**\n\n` +
               `**Error**: ${detalle}\n\n` +
               `💡 **Sugerencias**:\n` +
               `• Verifica la configuración de Azure Search\n` +
               `• Revisa las variables de entorno\n` +
               `• Contacta al administrador del sistema si persiste\n\n` +
               `🔧 **Servicio**: DocumentService v2.0`;
    }

    crearRespuestaSinResultados(consulta, analysis, userId) {
        const sugerencias = this.generarSugerenciasBusqueda(consulta, analysis);
        
        return `🔍 **Búsqueda realizada**: "${consulta}"\n\n` +
               `❌ **Sin resultados relevantes** encontrados en el índice.\n\n` +
               `💡 **Sugerencias inteligentes**:\n${sugerencias}\n\n` +
               `📊 **Detalles técnicos**:\n` +
               `• Índice consultado: ${this.indexName}\n` +
               `• Tipo de búsqueda: ${this.openaiAvailable ? 'Vectorial + Textual' : 'Solo textual'}\n` +
               `• Análisis de consulta: ${analysis.type} (${analysis.intent})\n` +
               `• Palabras clave detectadas: ${analysis.keywords.slice(0, 5).join(', ')}`;
    }

    /**
     * ✅ SUGERENCIAS INTELIGENTES DE BÚSQUEDA
     */
    generarSugerenciasBusqueda(consulta, analysis) {
        let sugerencias = [];

        // Sugerencias basadas en el tipo de consulta
        if (analysis.type === 'api') {
            sugerencias.push('• Intenta "API Nova" o "endpoints disponibles"');
            sugerencias.push('• Usa términos como "servicio", "método", "request"');
        } else if (analysis.type === 'authentication') {
            sugerencias.push('• Prueba con "validación usuario" o "login Nova"');
            sugerencias.push('• Busca "autenticación" o "token"');
        } else {
            sugerencias.push('• Usa términos más generales o específicos');
            sugerencias.push('• Intenta sinónimos o palabras relacionadas');
        }

        // Sugerencias basadas en palabras clave
        if (analysis.keywords.length > 0) {
            const keywordSuggestion = analysis.keywords.slice(0, 2).join(' ');
            sugerencias.push(`• Busca solo: "${keywordSuggestion}"`);
        }

        sugerencias.push('• Verifica la ortografía y acentos');
        
        return sugerencias.join('\n');
    }

    /**
     * ✅ EMBEDDING MEJORADO CON CACHÉ Y RETRY
     */
    async createEmbedding(text) {
        if (!this.openaiAvailable) {
            throw new Error('Servicio de embeddings no disponible');
        }

        try {
            const cleanText = text.trim();
            if (!cleanText) {
                throw new Error('Texto vacío para embedding');
            }

            // Limitar longitud del texto para embeddings
            const maxEmbeddingLength = 8000;
            const textForEmbedding = cleanText.length > maxEmbeddingLength 
                ? cleanText.substring(0, maxEmbeddingLength)
                : cleanText;

            const result = await this.openaiClient.embeddings.create({
                input: textForEmbedding,
                model: this.embeddingModel
            });
            
            if (!result?.data?.[0]?.embedding) {
                throw new Error('No se recibió embedding válido de Azure OpenAI');
            }
            
            return result.data[0].embedding;
                
        } catch (error) {
            console.error('❌ Error creando embedding:', error.message);
            
            // Reintentar una vez en caso de error temporal
            if (!error.retried) {
                console.log('🔄 Reintentando creación de embedding...');
                error.retried = true;
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.createEmbedding(text);
            }
            
            throw error;
        }
    }

    /**
     * ✅ SANITIZACIÓN MEJORADA DE QUERIES
     */
    sanitizeQuery(query) {
        if (!query || typeof query !== 'string') {
            return '*';
        }

        // Preservar caracteres importantes para búsquedas técnicas
        let sanitized = query
            .replace(/[+\-&|!(){}[\]^"~*?:\\]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!sanitized) return '*';

        // Procesar palabras manteniendo relevancia técnica
        const words = sanitized.split(' ').filter(word => word.length > 0);
        const cleanWords = words.map(word => {
            // Mantener palabras técnicas importantes
            if (['API', 'REST', 'JSON', 'HTTP', 'GET', 'POST', 'PUT', 'DELETE'].includes(word.toUpperCase())) {
                return word.toUpperCase();
            }
            
            // Limpiar caracteres especiales al inicio/final
            word = word.replace(/^[^a-zA-Z0-9áéíóúñü]+|[^a-zA-Z0-9áéíóúñü]+$/g, '');
            return word.length < 2 ? null : word;
        }).filter(Boolean);

        if (cleanWords.length === 0) return '*';
        
        const finalQuery = cleanWords.join(' ');
        console.log(`🧹 Query optimizada: "${query}" → "${finalQuery}"`);
        return finalQuery;
    }

    /**
     * ✅ MÉTODOS DE UTILIDAD Y CONFIGURACIÓN
     */
    getConfigInfo() {
        return {
            searchAvailable: this.searchAvailable,
            openaiAvailable: this.openaiAvailable,
            indexName: this.indexName || 'No configurado',
            vectorField: this.vectorField || 'No configurado',
            embeddingModel: this.embeddingModel || 'No configurado',
            error: this.initializationError,
            version: '2.0.0-intelligent-processing',
            config: {
                maxDocumentsPerSearch: this.config.maxDocumentsPerSearch,
                maxContextLength: this.config.maxContextLength,
                synthesisTemperature: this.config.synthesisTemperature,
                minScore: this.config.minScore
            },
            features: {
                intelligentQueryAnalysis: true,
                optimizedSearch: true,
                smartFiltering: true,
                concreteSynthesis: this.openaiAvailable,
                fallbackProcessing: true,
                duplicateAvoidance: true,
                relevanceScoring: true,
                contextOptimization: true
            }
        };
    }

    isAvailable() {
        return this.searchAvailable;
    }

    getServiceStats() {
        return {
            available: this.isAvailable(),
            searchEngine: this.searchAvailable ? 'Azure AI Search' : 'No disponible',
            aiSynthesis: this.openaiAvailable ? 'Azure OpenAI' : 'Fallback automático',
            processingVersion: '2.0.0-intelligent',
            features: [
                'Análisis inteligente de consultas',
                'Búsqueda híbrida optimizada',
                'Filtrado por relevancia',
                'Síntesis concreta y directa',
                'Eliminación de duplicados',
                'Respuestas estructuradas'
            ]
        };
    }

    /**
     * ✅ MÉTODO DE LIMPIEZA Y MANTENIMIENTO
     */
    cleanup() {
        console.log('🧹 DocumentService v2.0 - Limpieza completada');
        // Limpiar caché si existiera, cerrar conexiones, etc.
    }

    /**
     * ✅ TESTING Y DIAGNÓSTICOS
     */
    async testConnection() {
        if (!this.searchAvailable) {
            console.log('⚠️ Azure Search no disponible para testing');
            return false;
        }

        try {
            const testQuery = "test";
            const results = await this.searchClient.search(testQuery, {
                top: 1,
                select: ['FileName'],
                timeout: 5000
            });

            let hasResults = false;
            for await (const result of results.results) {
                hasResults = true;
                break;
            }

            console.log(`✅ Test de conexión Azure Search: ${hasResults ? 'OK con datos' : 'OK sin datos'}`);
            return true;

        } catch (error) {
            console.error('❌ Error en test de conexión:', error.message);
            return false;
        }
    }

    async testEmbeddingConnection() {
        if (!this.openaiAvailable) {
            console.log('⚠️ Azure OpenAI no disponible para testing embeddings');
            return false;
        }

        try {
            const testEmbedding = await this.createEmbedding("test embedding");
            const isValid = Array.isArray(testEmbedding) && testEmbedding.length > 1000;
            
            console.log(`✅ Test de embeddings: ${isValid ? 'OK' : 'Respuesta inválida'}`);
            return isValid;

        } catch (error) {
            console.error('❌ Error en test de embeddings:', error.message);
            return false;
        }
    }
}

// Crear instancia singleton
const documentService = new DocumentService();
module.exports = documentService;