// services/documentService.js - CORRECCIÓN PARA QUERY PARSING
const { SearchClient, SearchIndexClient, AzureKeyCredential } = require('@azure/search-documents');
const OpenAI = require('openai');
require('dotenv').config();

/**
 * Servicio corregido para búsqueda de documentos usando Azure Search con embeddings vectoriales
 * ✅ CORREGIDO: Query parsing y caracteres especiales
 */
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

        console.log('🔍 Inicializando Document Service...');
        this.initializeAzureSearch();
        this.initializeOpenAI();
        
        DocumentService.instance = this;
        console.log(`✅ Document Service inicializado - Search: ${this.searchAvailable}, OpenAI: ${this.openaiAvailable}`);
    }

    /**
     * ✅ NUEVO: Sanitizar consulta para Azure Search
     */
    sanitizeQuery(query) {
        if (!query || typeof query !== 'string') {
            return '*';
        }

        let sanitized = query
            // Remover caracteres especiales problemáticos
            .replace(/[+\-&|!(){}[\]^"~*?:\\]/g, ' ')
            // Remover múltiples espacios
            .replace(/\s+/g, ' ')
            // Trim
            .trim();

        // Si queda vacío después de sanitizar, usar wildcard
        if (!sanitized) {
            return '*';
        }

        // Escapar palabras que pueden ser problemáticas
        const words = sanitized.split(' ').filter(word => word.length > 0);
        const cleanWords = words.map(word => {
            // Remover caracteres especiales al inicio/final
            word = word.replace(/^[^a-zA-Z0-9áéíóúñü]+|[^a-zA-Z0-9áéíóúñü]+$/g, '');
            
            // Si la palabra es muy corta o tiene solo números, puede causar problemas
            if (word.length < 2) {
                return null;
            }
            
            return word;
        }).filter(Boolean);

        // Si no quedan palabras válidas, usar wildcard
        if (cleanWords.length === 0) {
            return '*';
        }

        const finalQuery = cleanWords.join(' ');
        
        console.log(`🧹 Query sanitizada: "${query}" → "${finalQuery}"`);
        return finalQuery;
    }

    /**
     * ✅ CORREGIDO: Inicialización Azure Search
     */
    initializeAzureSearch() {
        try {
            const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
            const apiKey = process.env.AZURE_SEARCH_API_KEY;
            const indexName = 'nova';

            console.log('🔍 Configuración Azure Search:', {
                endpoint: endpoint ? `✅ ${endpoint}` : '❌ Faltante',
                apiKey: apiKey ? '✅ Configurado' : '❌ Faltante',
                indexName
            });

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
            this.testSearchConnection();
            
        } catch (error) {
            console.error('❌ Error inicializando Azure Search:', error.message);
            this.searchAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * ✅ CORREGIDO: Inicialización Azure OpenAI para embeddings
     */
    initializeOpenAI() {
        try {
            console.log('🔧 [DocumentService] Inicializando Azure OpenAI para embeddings...');
            
            const azureOpenaiEndpoint = process.env.OPENAI_ENDPOINT;
            const azureOpenaiKey = process.env.OPENAI_API_KEY;
            
            if (!azureOpenaiEndpoint || !azureOpenaiKey) {
                throw new Error('Variables OPENAI_ENDPOINT y OPENAI_API_KEY requeridas para DocumentService');
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
            
            console.log('✅ [DocumentService] Azure OpenAI configurado');
            this.testEmbeddingConnection();

        } catch (error) {
            console.error('❌ [DocumentService] Error inicializando Azure OpenAI:', error.message);
            this.openaiAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * ✅ Test de conectividad con Azure OpenAI embeddings
     */
    async testEmbeddingConnection() {
        try {
            console.log('🧪 [DocumentService] Probando conectividad con Azure OpenAI embeddings...');
            
            const testText = 'test connectivity for document service embeddings';
            const result = await this.openaiClient.embeddings.create({
                input: testText
            });
            
            if (result?.data?.[0]?.embedding) {
                const vectorLength = result.data[0].embedding.length;
                console.log(`✅ [DocumentService] Test de embeddings exitoso (${vectorLength}D)`);
                return true;
            } else {
                throw new Error('Respuesta inválida del servicio de embeddings');
            }
            
        } catch (error) {
            console.error('❌ [DocumentService] Test de embeddings falló:', {
                message: error.message,
                status: error.status,
                code: error.code
            });
            this.openaiAvailable = false;
            return false;
        }
    }

    /**
     * ✅ Test de conectividad Azure Search
     */
    async testSearchConnection() {
        try {
            console.log('🧪 [DocumentService] Probando conectividad con Azure Search...');
            
            const indexStats = await this.indexClient.getIndexStatistics(this.indexName);
            console.log('📊 Estadísticas del índice:', {
                documentCount: indexStats.documentCount,
                storageSize: indexStats.storageSize
            });
            
            // Test de búsqueda simple sanitizada
            const testResults = await this.searchClient.search('*', { 
                top: 1,
                select: ['FileName'],
                includeTotalCount: true
            });
            
            const totalCount = testResults.count ?? 0;
            console.log(`✅ [DocumentService] Azure Search conectado exitosamente (${totalCount} docs)`);
            return true;
            
        } catch (error) {
            console.error('❌ [DocumentService] Test Azure Search falló:', {
                message: error.message,
                statusCode: error.statusCode
            });
            return false;
        }
    }

    /**
     * ✅ CORREGIDO: Crear embedding usando Azure OpenAI
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

            console.log(`🧠 [DocumentService] Creando embedding...`);
            
            const startTime = Date.now();
            const result = await this.openaiClient.embeddings.create({
                input: cleanText
            });
            const duration = Date.now() - startTime;
            
            if (!result?.data?.[0]?.embedding) {
                throw new Error('No se recibió embedding válido');
            }
            
            const embedding = result.data[0].embedding;
            console.log(`✅ [DocumentService] Embedding creado en ${duration}ms (${embedding.length}D)`);
            
            return embedding;
                
        } catch (error) {
            console.error('❌ [DocumentService] Error creando embedding:', {
                message: error.message,
                status: error.status
            });
            
            if (error.status === 401) {
                throw new Error('Error de autenticación con Azure OpenAI');
            } else if (error.status === 404) {
                throw new Error(`Deployment '${this.embeddingModel}' no encontrado`);
            } else {
                throw new Error(`Error creando embedding: ${error.message}`);
            }
        }
    }

    /**
 * ✅ MÉTODO PRINCIPAL CON DEBUG: Buscar documentos
 */
async buscarDocumentos(consulta, userId = 'unknown') {
    console.log(`🚀 [${userId}] === INICIO BÚSQUEDA DOCUMENTOS ===`);
    
    if (!this.searchAvailable) {
        const errorMsg = `⚠️ **Servicio de búsqueda no disponible**\n\n${this.initializationError || 'Azure Search no configurado'}`;
        console.log(`❌ [${userId}] Service no disponible, retornando: "${errorMsg.substring(0, 100)}..."`);
        return errorMsg;
    }

    try {
        const consultaSanitizada = this.sanitizeQuery(consulta);
        console.log(`🔍 [${userId}] Búsqueda: "${consulta}" → "${consultaSanitizada}"`);

        let vectorQuery = null;
        
        // Intentar crear embedding para búsqueda vectorial
        if (this.openaiAvailable) {
            try {
                console.log(`🧠 [${userId}] Creando embedding...`);
                const vector = await this.createEmbedding(consulta);
                
                vectorQuery = {
                    kNearestNeighborsCount: 15,
                    fields: this.vectorField,
                    vector
                };
                
                console.log(`✅ [${userId}] Vector query configurado (${vector.length}D)`);
                
            } catch (embError) {
                console.error(`❌ [${userId}] Error creando embedding:`, embError.message);
                console.log(`🔄 [${userId}] Continuando con búsqueda solo textual`);
            }
        }
        
        // Configurar opciones de búsqueda
        const searchOptions = {
            select: ['Chunk', 'FileName', 'Folder'],
            top: 20,
            searchMode: 'any',
            queryType: 'simple',
            includeTotalCount: true
        };
        
        if (vectorQuery) {
            searchOptions.vectorQueries = [vectorQuery];
            console.log(`🎯 [${userId}] Ejecutando búsqueda HÍBRIDA`);
        } else {
            console.log(`📝 [${userId}] Ejecutando búsqueda SOLO TEXTO`);
        }

        console.log(`🔎 [${userId}] Ejecutando búsqueda en Azure...`);
        const searchResults = await this.searchClient.search(consultaSanitizada, searchOptions);

        console.log(`📊 [${userId}] Procesando resultados... Total: ${searchResults.count || 'N/A'}`);
        
        const resultados = [];
        const documentosProcesados = new Set();
        let resultadosIterados = 0;
        
        for await (const result of searchResults.results) {
            resultadosIterados++;
            console.log(`🔄 [${userId}] Procesando resultado ${resultadosIterados}:`, {
                score: result.score,
                hasDocument: !!result.document,
                fileName: result.document?.FileName || 'N/A',
                chunkLength: result.document?.Chunk?.length || 0
            });
            
            const doc = result.document || {};
            const score = result.score || 0;
            
            const fileName = doc.FileName || '(sin nombre)';
            const folder = doc.Folder || '';
            const chunkSrc = doc.Chunk || '';
            const chunk = chunkSrc.substring(0, 400) + (chunkSrc.length > 400 ? '...' : '');
            
            const documentKey = `${fileName}-${chunkSrc.substring(0, 50)}`;
            
            if (!documentosProcesados.has(documentKey)) {
                documentosProcesados.add(documentKey);
                const resultado = {
                    fileName,
                    folder,
                    chunk,
                    score,
                    fullChunk: chunkSrc
                };
                
                resultados.push(resultado);
                console.log(`✅ [${userId}] Agregado resultado: ${fileName} (score: ${score.toFixed(3)})`);
            } else {
                console.log(`⚠️ [${userId}] Resultado duplicado omitido: ${fileName}`);
            }
            
            if (resultados.length >= 10) {
                console.log(`🛑 [${userId}] Límite de resultados alcanzado (10)`);
                break;
            }
        }
        
        console.log(`📋 [${userId}] === RESUMEN PROCESAMIENTO ===`);
        console.log(`   Resultados iterados: ${resultadosIterados}`);
        console.log(`   Resultados finales: ${resultados.length}`);
        console.log(`   Documentos procesados: ${documentosProcesados.size}`);
        
        if (resultados.length === 0) {
            console.log(`❌ [${userId}] Sin resultados, intentando búsqueda ampliada...`);
            const resultadoAmpliado = await this.busquedaAmpliada(consulta, userId);
            console.log(`🔄 [${userId}] Búsqueda ampliada retornó: "${resultadoAmpliado.substring(0, 100)}..."`);
            return resultadoAmpliado;
        }
        
        console.log(`🎨 [${userId}] Formateando ${resultados.length} resultados...`);
        const respuestaFinal = this.formatearResultados(resultados, consulta, userId);
        
        console.log(`✅ [${userId}] === FIN BÚSQUEDA DOCUMENTOS ===`);
        console.log(`📤 [${userId}] Respuesta final (${respuestaFinal.length} chars): "${respuestaFinal.substring(0, 150)}..."`);
        
        return respuestaFinal;
            
    } catch (error) {
        console.error(`❌ [${userId}] === ERROR EN BÚSQUEDA ===`, {
            message: error.message,
            statusCode: error.statusCode,
            code: error.code,
            stack: error.stack?.split('\n').slice(0, 3)
        });
        
        const errorMsg = `❌ **Error en búsqueda de documentos**: ${error.message}`;
        console.log(`📤 [${userId}] Retornando error: "${errorMsg}"`);
        return errorMsg;
    }
}

// 🔽 Pega dentro de la clase DocumentService

/**
 * ✅ NUEVO: Buscar documentos y devolver resultados RAW (para RAG)
 * Retorna un arreglo [{ fileName, folder, chunk, score }]
 */
// ✅ CORRECCIONES PARA MEJORAR RAG VECTOR SEARCH

/**
 * 🔧 PROBLEMA IDENTIFICADO:
 * - La búsqueda vectorial puede no estar funcionando correctamente
 * - Los embeddings pueden no estar alineados
 * - La configuración híbrida puede tener conflictos
 * - Los filtros pueden ser muy restrictivos
 */

// 1️⃣ CORREGIR EL MÉTODO buscarDocumentosRaw
async buscarDocumentosRaw(consulta, userId = 'unknown', options = {}) {
    console.log(`🚀 [${userId}] === BÚSQUEDA RAW PARA RAG (CORREGIDA) ===`);
    console.log(`🔍 [${userId}] Consulta original: "${consulta}"`);
    
    if (!this.searchAvailable) {
        throw new Error(this.initializationError || 'Azure Search no configurado');
    }

    const {
        k = 6,
        kNeighbors = 20,  // ✅ AUMENTAR vecinos para mejor recall
        select = ['Chunk', 'FileName', 'Folder'],
        maxPerFile = 3    // ✅ AUMENTAR chunks por archivo
    } = options;

    // 1) Sanitizar consulta (más permisivo)
    const consultaSanitizada = this.sanitizeQueryForRAG(consulta);
    console.log(`🧹 [${userId}] Consulta sanitizada: "${consultaSanitizada}"`);

    // 2) ESTRATEGIA DUAL: Probar vectorial primero, luego texto
    let resultados = [];
    
    // ✅ FASE 1: Búsqueda SOLO VECTORIAL (sin texto híbrido)
    if (this.openaiAvailable) {
        try {
            console.log(`🧠 [${userId}] === FASE 1: BÚSQUEDA SOLO VECTORIAL ===`);
            const vector = await this.createEmbedding(consulta);
            
            const vectorOnlyOptions = {
                vectorQueries: [{
                    kNearestNeighborsCount: kNeighbors,
                    fields: this.vectorField,
                    vector
                }],
                select,
                top: k * 3,  // Más resultados para filtrar después
                includeTotalCount: true
            };
            
            console.log(`🎯 [${userId}] Ejecutando búsqueda SOLO vectorial...`);
            const vectorResults = await this.searchClient.search("*", vectorOnlyOptions);
            
            const vectorDocs = await this.procesarResultadosRAG(vectorResults, k, maxPerFile, userId, "VECTOR");
            
            if (vectorDocs.length > 0) {
                console.log(`✅ [${userId}] Búsqueda vectorial exitosa: ${vectorDocs.length} docs`);
                resultados = vectorDocs;
            } else {
                console.log(`⚠️ [${userId}] Búsqueda vectorial sin resultados, intentando híbrida...`);
            }
            
        } catch (vectorError) {
            console.error(`❌ [${userId}] Error en búsqueda vectorial:`, vectorError.message);
        }
    }
    
    // ✅ FASE 2: Si vectorial falló, probar HÍBRIDA con query más flexible
    if (resultados.length === 0) {
        try {
            console.log(`🔄 [${userId}] === FASE 2: BÚSQUEDA HÍBRIDA ===`);
            
            let vectorQuery = null;
            if (this.openaiAvailable) {
                try {
                    const vector = await this.createEmbedding(consulta);
                    vectorQuery = {
                        kNearestNeighborsCount: kNeighbors,
                        fields: this.vectorField,
                        vector
                    };
                } catch (e) {
                    console.warn(`⚠️ [${userId}] Vector no disponible para híbrida`);
                }
            }
            
            const searchOptions = {
                select,
                top: k * 4,
                searchMode: 'any',      // ✅ Modo más permisivo
                queryType: 'simple',
                includeTotalCount: true,
                searchFields: ['Chunk', 'FileName'], // ✅ Campos específicos
                scoringProfile: null    // ✅ Sin perfil de scoring personalizado
            };
            
            if (vectorQuery) {
                searchOptions.vectorQueries = [vectorQuery];
            }
            
            console.log(`🎯 [${userId}] Ejecutando búsqueda híbrida...`);
            const hybridResults = await this.searchClient.search(consultaSanitizada, searchOptions);
            
            resultados = await this.procesarResultadosRAG(hybridResults, k, maxPerFile, userId, "HÍBRIDA");
            
        } catch (hybridError) {
            console.error(`❌ [${userId}] Error en búsqueda híbrida:`, hybridError.message);
        }
    }
    
    // ✅ FASE 3: Si todo falló, búsqueda de emergencia SOLO TEXTO
    if (resultados.length === 0) {
        console.log(`🆘 [${userId}] === FASE 3: BÚSQUEDA DE EMERGENCIA ===`);
        try {
            // Usar términos más amplios
            const terminos = consulta.split(' ').filter(t => t.length > 3).slice(0, 3).join(' ');
            const queryEmergencia = terminos || '*';
            
            const emergencyResults = await this.searchClient.search(queryEmergencia, {
                select,
                top: k * 2,
                searchMode: 'any',
                queryType: 'simple',
                includeTotalCount: true
            });
            
            resultados = await this.procesarResultadosRAG(emergencyResults, Math.max(k, 3), maxPerFile, userId, "EMERGENCIA");
            
        } catch (emergencyError) {
            console.error(`❌ [${userId}] Error en búsqueda de emergencia:`, emergencyError.message);
        }
    }
    
    console.log(`📊 [${userId}] === RESULTADO FINAL RAG ===`);
    console.log(`📄 [${userId}] Documentos encontrados: ${resultados.length}`);
    
    if (resultados.length === 0) {
        console.warn(`⚠️ [${userId}] NINGUNA estrategia encontró resultados para: "${consulta}"`);
        
        // ✅ DIAGNÓSTICO: Verificar conectividad e índice
        await this.diagnosticarIndiceRAG(userId);
    } else {
        console.log(`✅ [${userId}] RAG exitoso con ${resultados.length} documentos relevantes`);
        resultados.forEach((r, i) => {
            console.log(`   ${i+1}. ${r.fileName} (score: ${r.score.toFixed(3)}) - ${r.chunk.substring(0, 50)}...`);
        });
    }
    
    return resultados;
}

// 2️⃣ NUEVO: Sanitización específica para RAG (más permisiva)
sanitizeQueryForRAG(query) {
    if (!query || typeof query !== 'string') return '*';
    
    // Para RAG, ser más permisivo con caracteres especiales
    let sanitized = query
        .replace(/[+\-&|!(){}[\]^"~\\]/g, ' ')  // ✅ Mantener * y ? para wildcards
        .replace(/\s+/g, ' ')
        .trim();
    
    if (!sanitized || sanitized.length < 2) return '*';
    
    // Para consultas muy cortas, agregar wildcard
    if (sanitized.length <= 4 && !sanitized.includes('*')) {
        sanitized = `${sanitized}*`;
    }
    
    return sanitized;
}

// 3️⃣ NUEVO: Procesador de resultados específico para RAG
async procesarResultadosRAG(searchResults, k, maxPerFile, userId, estrategia) {
    console.log(`🔄 [${userId}] Procesando resultados ${estrategia}...`);
    
    const resultados = [];
    const porArchivo = new Map();
    let procesados = 0;
    
    try {
        for await (const result of searchResults.results) {
            procesados++;
            
            const doc = result.document || {};
            const score = result.score || 0;
            const fileName = doc.FileName || '(sin nombre)';
            const chunk = (doc.Chunk || '').trim();
            
            // ✅ Filtros mejorados
            if (!chunk || chunk.length < 10) {
                console.log(`   ⏭️ [${userId}] Skip: chunk muy corto`);
                continue;
            }
            
            // ✅ Control por archivo más flexible
            if (!porArchivo.has(fileName)) porArchivo.set(fileName, 0);
            if (porArchivo.get(fileName) >= maxPerFile) {
                console.log(`   ⏭️ [${userId}] Skip: límite por archivo (${fileName})`);
                continue;
            }
            
            porArchivo.set(fileName, porArchivo.get(fileName) + 1);
            
            resultados.push({
                fileName,
                folder: doc.Folder || '',
                chunk,
                score,
                estrategia  // ✅ Marcar la estrategia usada
            });
            
            console.log(`   ✅ [${userId}] Agregado: ${fileName} (score: ${score.toFixed(3)}, estrategia: ${estrategia})`);
            
            if (resultados.length >= k) {
                console.log(`   🛑 [${userId}] Límite alcanzado (${k})`);
                break;
            }
        }
        
        console.log(`📊 [${userId}] ${estrategia}: procesados ${procesados}, seleccionados ${resultados.length}`);
        return resultados;
        
    } catch (error) {
        console.error(`❌ [${userId}] Error procesando ${estrategia}:`, error.message);
        return [];
    }
}

// 4️⃣ NUEVO: Diagnóstico del índice para RAG
async diagnosticarIndiceRAG(userId) {
    console.log(`🔍 [${userId}] === DIAGNÓSTICO RAG ===`);
    
    try {
        // Verificar estadísticas del índice
        if (this.indexClient && this.indexName) {
            const stats = await this.indexClient.getIndexStatistics(this.indexName);
            console.log(`📊 [${userId}] Estadísticas del índice:`, {
                documentCount: stats.documentCount,
                storageSize: stats.storageSize
            });
            
            if (stats.documentCount === 0) {
                console.error(`❌ [${userId}] PROBLEMA: Índice vacío (0 documentos)`);
                return;
            }
        }
        
        // Test de búsqueda básica
        console.log(`🧪 [${userId}] Test de búsqueda básica...`);
        const testBasic = await this.searchClient.search("*", {
            top: 5,
            select: ['FileName', 'Chunk'],
            includeTotalCount: true
        });
        
        let count = 0;
        const samples = [];
        for await (const result of testBasic.results) {
            count++;
            samples.push({
                file: result.document?.FileName,
                hasChunk: !!(result.document?.Chunk),
                chunkLength: (result.document?.Chunk || '').length
            });
            if (count >= 3) break;
        }
        
        console.log(`📄 [${userId}] Muestra de documentos:`, samples);
        console.log(`📊 [${userId}] Total en índice: ${testBasic.count || 'desconocido'}`);
        
        // Test de embedding si está disponible
        if (this.openaiAvailable) {
            console.log(`🧠 [${userId}] Test de embedding...`);
            try {
                const testVector = await this.createEmbedding("test documento nova");
                console.log(`✅ [${userId}] Embedding OK (${testVector.length}D)`);
                
                // Test de búsqueda vectorial simple
                const vectorTest = await this.searchClient.search("*", {
                    vectorQueries: [{
                        kNearestNeighborsCount: 3,
                        fields: this.vectorField,
                        vector: testVector
                    }],
                    select: ['FileName'],
                    top: 3
                });
                
                let vectorCount = 0;
                for await (const result of vectorTest.results) {
                    vectorCount++;
                }
                
                console.log(`🎯 [${userId}] Búsqueda vectorial test: ${vectorCount} resultados`);
                
            } catch (embError) {
                console.error(`❌ [${userId}] Error en test de embedding:`, embError.message);
            }
        }
        
    } catch (diagError) {
        console.error(`❌ [${userId}] Error en diagnóstico:`, diagError.message);
    }
}

// 5️⃣ MEJORAR needsDocumentSearch en OpenAIService
needsDocumentSearchMejorado(mensaje) {
    const mensajeLower = mensaje.toLowerCase();
    
    // ✅ EXPANDIR palabras clave para mayor cobertura
    const documentKeywords = [
        // APIs y endpoints (más específico)
        'endpoint', 'api', 'rest', 'validasocio', 'valida socio', 'validar socio',
        'autenticacion', 'autenticación', 'login', 'token', 'bearer',
        'get', 'post', 'put', 'delete', 'request', 'response',
        
        // Versiones y documentación
        'version', 'versión', 'v1', 'v2', 'documentacion', 'documentación',
        'especificacion', 'especificación', 'manual', 'guía', 'guia',
        
        // Procedimientos y políticas
        'procedimiento', 'proceso', 'política', 'politica', 'lineamiento',
        'norma', 'regla', 'protocolo', 'instructivo', 'metodología',
        
        // Validaciones y controles
        'validacion', 'validación', 'control', 'verificacion', 'verificación',
        'requisito', 'campo', 'parametro', 'parámetro', 'formato',
        
        // ✅ NUEVA CATEGORÍA: Preguntas técnicas generales
        'como funciona', 'cómo funciona', 'que es', 'qué es',
        'para que sirve', 'para qué sirve', 'como se usa', 'cómo se usa',
        'como hacer', 'cómo hacer', 'instrucciones', 'pasos',
        
        // ✅ NUEVA CATEGORÍA: Referencias específicas Nova
        'nova', 'sistema nova', 'plataforma', 'servicio',
        'configuracion', 'configuración', 'parametrizacion', 'setup',
        
        // ✅ NUEVA CATEGORÍA: Consultas informativas
        'información', 'informacion', 'detalles', 'explicación',
        'explicacion', 'descripcion', 'descripción'
    ];
    
    const needsSearch = documentKeywords.some(keyword => mensajeLower.includes(keyword));
    
    // ✅ LÓGICA ADICIONAL: Detectar preguntas (interrogativas)
    const esPreguntas = mensajeLower.match(/^(qué|que|cómo|como|cuál|cual|dónde|donde|cuándo|cuando|por qué|por que|para qué|para que)/);
    
    const finalDecision = needsSearch || esPreguntas;
    
    if (finalDecision) {
        console.log(`📚 [MEJORADO] Búsqueda de documentos requerida para: "${mensaje.substring(0, 50)}..."`);
        if (needsSearch) {
            console.log(`   🎯 Palabras clave: ${documentKeywords.filter(k => mensajeLower.includes(k)).join(', ')}`);
        }
        if (esPreguntas) {
            console.log(`   ❓ Detectada pregunta interrogativa`);
        }
    }
    
    return finalDecision;
}

// 6️⃣ COMANDO DE DEBUGGING para probar manualmente
async testRAGManual(consulta, userId = 'test') {
    console.log(`🧪 [${userId}] === TEST RAG MANUAL ===`);
    console.log(`🔍 [${userId}] Consulta: "${consulta}"`);
    
    // Test paso a paso
    try {
        // 1. Test embedding
        if (this.openaiAvailable) {
            const vector = await this.createEmbedding(consulta);
            console.log(`✅ [${userId}] Embedding creado: ${vector.length}D`);
        }
        
        // 2. Test búsqueda RAG
        const resultados = await this.buscarDocumentosRaw(consulta, userId, {
            k: 5,
            kNeighbors: 15
        });
        
        console.log(`📊 [${userId}] Resultados RAG: ${resultados.length}`);
        
        // 3. Test construcción de contexto
        if (resultados.length > 0) {
            const contexto = this.construirContextoRAG(resultados);
            console.log(`📄 [${userId}] Contexto construido: ${contexto.length} caracteres`);
            
            return {
                success: true,
                resultados,
                contexto: contexto.substring(0, 500) + '...'
            };
        } else {
            return {
                success: false,
                mensaje: 'No se encontraron documentos'
            };
        }
        
    } catch (error) {
        console.error(`❌ [${userId}] Error en test RAG:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * ✅ NUEVO: Helper para construir contexto compacto para RAG
 * Une los mejores chunks con delimitadores y metadatos.
 */
construirContextoRAG(resultadosRaw) {
    if (!Array.isArray(resultadosRaw) || resultadosRaw.length === 0) return '';
    const piezas = resultadosRaw.map((r, i) => {
        const header = `[[DOC ${i+1} — ${r.fileName}${r.folder ? ' | ' + r.folder : ''}]]`;
        const body = r.chunk.length > 1600 ? (r.chunk.slice(0, 1600) + '…') : r.chunk;
        return `${header}\n${body}`;
    });
    return piezas.join('\n\n---\n\n');
}

    /**
     * ✅ BÚSQUEDA AMPLIADA corregida
     */
    async busquedaAmpliada(consulta, userId) {
        try {
            console.log(`🔄 [${userId}] Ejecutando búsqueda ampliada...`);
            
            // Términos más generales sanitizados
            const palabras = (consulta || '').split(' ').filter(p => p.length > 2);
            const consultaAmplia = palabras.length > 0 ? this.sanitizeQuery(palabras[0]) : '*';
            
            const searchResults = await this.searchClient.search(consultaAmplia, {
                select: ['Chunk', 'FileName', 'Folder'],
                top: 15,
                searchMode: 'any',
                queryType: 'simple' // ✅ También usar 'simple' aquí
            });
            
            const resultados = [];
            for await (const result of searchResults.results) {
                const doc = result.document || {};
                const fileName = doc.FileName || '(sin nombre)';
                const chunkSrc = doc.Chunk || '';
                const chunk = chunkSrc.substring(0, 400) + (chunkSrc.length > 400 ? '...' : '');
                
                resultados.push({
                    fileName,
                    folder: doc.Folder || '',
                    chunk,
                    score: result.score || 0,
                    fullChunk: chunkSrc,
                    fromExtendedSearch: true
                });
                
                if (resultados.length >= 8) break;
            }
            
            if (resultados.length > 0) {
                console.log(`✅ [${userId}] Búsqueda ampliada encontró ${resultados.length} resultados`);
                return this.formatearResultados(resultados, consulta, userId);
            } else {
                return this.sinResultados(consulta, userId);
            }
            
        } catch (error) {
            console.error(`❌ [${userId}] Error en búsqueda ampliada:`, error.message);
            return this.sinResultados(consulta, userId);
        }
    }

    /**
 * ✅ MÉTODO CORREGIDO: formatearResultados con debugging
 */
formatearResultados(resultados, consulta, userId) {
    console.log(`🎨 [${userId}] Formateando ${resultados?.length || 0} resultados...`);
    
    if (!Array.isArray(resultados) || resultados.length === 0) {
        console.log(`❌ [${userId}] No hay resultados para formatear`);
        return this.sinResultados(consulta, userId);
    }

    console.log(`📋 [${userId}] Resultados a formatear:`, resultados.map(r => ({
        fileName: r.fileName,
        score: r.score,
        chunkLength: r.chunk?.length || 0
    })));

    let respuesta = `🔍 **Búsqueda: "${consulta}"**\n\n`;
    respuesta += `📚 **Documentos encontrados (${resultados.length}):**\n\n`;

    resultados.forEach((resultado, index) => {
        try {
            const folderInfo = resultado.folder ? ` [${resultado.folder}]` : '';
            respuesta += `**${index + 1}. ${resultado.fileName}**${folderInfo}`;
            
            if (resultado.score > 0) {
                respuesta += ` (Relevancia: ${(resultado.score * 100).toFixed(1)}%)`;
            }
            
            if (resultado.fromExtendedSearch) {
                respuesta += ` 🔍`;
            }
            
            respuesta += '\n';
            
            // ✅ VERIFICAR que el chunk no esté vacío
            const chunk = resultado.chunk || resultado.fullChunk || '(Sin contenido disponible)';
            respuesta += `${chunk}\n`;
            
            if (index < resultados.length - 1) {
                respuesta += '\n---\n\n';
            }
            
            console.log(`📄 [${userId}] Formateado resultado ${index + 1}: ${resultado.fileName}`);
            
        } catch (error) {
            console.error(`❌ [${userId}] Error formateando resultado ${index}:`, error);
            respuesta += `❌ Error procesando resultado ${index + 1}\n\n`;
        }
    });

    const searchType = this.openaiAvailable ? 
        'Azure OpenAI + Azure Search (Híbrida)' : 
        'Azure Search (Solo texto)';
        
    respuesta += `\n\n💡 **Búsqueda realizada con ${searchType}**`;
    respuesta += `\n¿Necesitas más información sobre algún documento específico?`;
    
    console.log(`✅ [${userId}] Respuesta formateada completamente (${respuesta.length} caracteres)`);
    console.log(`📤 [${userId}] Primeros 200 caracteres: "${respuesta.substring(0, 200)}..."`);
    
    return respuesta;
}

    /**
     * ✅ MENSAJE CUANDO NO HAY RESULTADOS
     */
    sinResultados(consulta, userId) {
        return `🔍 **Búsqueda: "${consulta}"**\n\n` +
               `❌ No se encontraron documentos relevantes en el índice.\n\n` +
               `💡 **Sugerencias:**\n` +
               `• Intenta con términos más generales\n` +
               `• Verifica la ortografía\n` +
               `• Usa sinónimos o palabras relacionadas\n` +
               `• Pregunta sobre temas más amplios (ej: "políticas", "procedimientos", "nova")\n\n` +
               `📊 **Índice consultado:** ${this.indexName}\n` +
               `🔧 **Tipo de búsqueda:** ${this.openaiAvailable ? 'Híbrida (Vector + Texto)' : 'Solo texto'}`;
    }

    /**
     * ✅ BÚSQUEDAS ESPECIALIZADAS con sanitización
     */
    async buscarPoliticas(tipoPolitica, userId = 'unknown') {
        console.log(`📋 [${userId}] Buscando políticas: ${tipoPolitica}`);
        
        const politicasComunes = {
            'vacaciones': 'política vacaciones días festivos permisos ausencias',
            'codigo vestimenta': 'código vestimenta dress code uniforme ropa',
            'horario': 'horario trabajo jornada laboral entrada salida',
            'home office': 'home office trabajo remoto teletrabajo casa',
            'prestaciones': 'prestaciones beneficios compensaciones aguinaldo prima',
            'codigo conducta': 'código conducta ética comportamiento valores',
            'seguridad': 'seguridad higiene protección personal accidentes',
            'capacitacion': 'capacitación entrenamiento desarrollo cursos',
            'nomina': 'nómina salarios pagos descuentos percepciones',
            'rh': 'recursos humanos personal contratación despido',
            'confidencialidad': 'confidencialidad información privada datos sensibles'
        };

        const terminos = politicasComunes[tipoPolitica?.toLowerCase?.()] || tipoPolitica;
        return await this.buscarDocumentos(terminos, userId);
    }

    async obtenerDiasFeriados(año, userId = 'unknown') {
        const añoActual = año || new Date().getFullYear();
        console.log(`📅 [${userId}] Buscando días feriados para ${añoActual}`);
        
        const consulta = `días feriados festivos ${añoActual} calendario oficial`;
        const resultado = await this.buscarDocumentos(consulta, userId);
        
        if (resultado.includes("No se encontraron documentos")) {
            return await this.buscarDocumentos("días feriados festivos oficiales política", userId);
        }
        return resultado;
    }

    async buscarDocumentosGenerales(consulta, userId = 'unknown') {
        console.log(`📖 [${userId}] Búsqueda general: "${consulta}"`);
        
        const consultaLower = (consulta || '').toLowerCase();
        
        if (consultaLower.includes('política') || consultaLower.includes('politica')) {
            const tiposPolitica = ['vacaciones', 'horario', 'vestimenta', 'conducta', 'seguridad', 'prestaciones'];
            const tipoPolitica = tiposPolitica.find(tipo => consultaLower.includes(tipo));
            if (tipoPolitica) {
                return await this.buscarPoliticas(tipoPolitica, userId);
            }
        }
        
        if (consultaLower.includes('feriado') || consultaLower.includes('festivo')) {
            const añoMatch = consulta.match(/\b(20\d{2})\b/);
            const año = añoMatch ? parseInt(añoMatch[1], 10) : new Date().getFullYear();
            return await this.obtenerDiasFeriados(año, userId);
        }
        
        return await this.buscarDocumentos(consulta, userId);
    }

    // ✅ MÉTODOS DE UTILIDAD
    isAvailable() {
        return this.searchAvailable;
    }

    getConfigInfo() {
        return {
            searchAvailable: this.searchAvailable,
            openaiAvailable: this.openaiAvailable,
            indexName: this.indexName || 'No configurado',
            vectorField: this.vectorField || 'No configurado',
            embeddingModel: this.embeddingModel || 'No configurado',
            error: this.initializationError,
            features: {
                vectorSearch: this.searchAvailable && this.openaiAvailable,
                textSearch: this.searchAvailable,
                policySearch: this.searchAvailable,
                holidaySearch: this.searchAvailable,
                hybridSearch: this.searchAvailable && this.openaiAvailable
            }
        };
    }

    async getStats() {
        try {
            const stats = {
                available: this.searchAvailable,
                searchAvailable: this.searchAvailable,
                openaiAvailable: this.openaiAvailable,
                indexName: this.indexName,
                vectorField: this.vectorField,
                embeddingModel: this.embeddingModel,
                features: this.getConfigInfo().features,
                timestamp: new Date().toISOString(),
                error: this.initializationError
            };

            if (this.searchAvailable) {
                try {
                    const indexStats = await this.indexClient.getIndexStatistics(this.indexName);
                    stats.indexStats = {
                        documentCount: indexStats.documentCount,
                        storageSize: indexStats.storageSize
                    };
                } catch (error) {
                    stats.indexStatsError = error.message;
                }
            }

            return stats;

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas DocumentService:', error);
            return {
                available: false,
                error: error.message
            };
        }
    }

    /**
     * ✅ NUEVO: Diagnóstico completo del servicio
     */
    async diagnosticarServicio(userId = 'diagnostic') {
        console.log(`🔍 [${userId}] === DIAGNÓSTICO DOCUMENT SERVICE ===`);
        
        const diagnostico = {
            timestamp: new Date().toISOString(),
            configuracion: {
                openai_endpoint: process.env.OPENAI_ENDPOINT ? 'Configurado' : 'FALTANTE',
                openai_api_key: process.env.OPENAI_API_KEY ? 'Configurado' : 'FALTANTE',
                azure_search_endpoint: process.env.AZURE_SEARCH_ENDPOINT ? 'Configurado' : 'FALTANTE',
                azure_search_key: process.env.AZURE_SEARCH_API_KEY ? 'Configurado' : 'FALTANTE'
            },
            servicios: {
                searchAvailable: this.searchAvailable,
                openaiAvailable: this.openaiAvailable,
                embeddingModel: this.embeddingModel,
                vectorField: this.vectorField,
                indexName: this.indexName
            },
            tests: {}
        };
        
        // Test Azure Search
        if (this.searchAvailable) {
            try {
                const stats = await this.indexClient.getIndexStatistics(this.indexName);
                diagnostico.tests.azureSearch = {
                    success: true,
                    documentCount: stats.documentCount,
                    storageSize: stats.storageSize
                };
            } catch (error) {
                diagnostico.tests.azureSearch = {
                    success: false,
                    error: error.message
                };
            }
        }
        
        // Test OpenAI Embeddings
        if (this.openaiAvailable) {
            try {
                const testEmbedding = await this.createEmbedding('test diagnostic');
                diagnostico.tests.openaiEmbeddings = {
                    success: true,
                    embeddingLength: testEmbedding.length,
                    deployment: this.embeddingModel
                };
            } catch (error) {
                diagnostico.tests.openaiEmbeddings = {
                    success: false,
                    error: error.message
                };
            }
        }
        
        // Test búsqueda híbrida con query sanitizada
        try {
            const testQuery = 'nova corporación documentos';
            const resultado = await this.buscarDocumentos(testQuery, userId);
            diagnostico.tests.hybridSearch = {
                success: !resultado.includes('Error'),
                hasResults: !resultado.includes('No se encontraron'),
                searchType: this.openaiAvailable ? 'hybrid' : 'text-only',
                sanitizedQuery: this.sanitizeQuery(testQuery)
            };
        } catch (error) {
            diagnostico.tests.hybridSearch = {
                success: false,
                error: error.message
            };
        }
        
        return diagnostico;
    }
}

// Crear instancia singleton
const documentService = new DocumentService();
module.exports = documentService;