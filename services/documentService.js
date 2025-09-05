// services/documentService.js - VERSIÓN OPTIMIZADA PARA FLUJO RAG: PREGUNTA → EMBEDDING → SEARCH → COMPLETION
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

        // Configuración optimizada para el flujo RAG específico
        this.config = {
            maxContextLength: 12000,
            maxChunkLength: 2000,
            minChunkLength: 20,
            minScoreVector: 0.35,        // Umbral para vectorial
            minScoreText: 0.0,           // NO filtrar por score en textual
            maxDocumentsPerSearch: 8,
            maxDocumentsPerFile: 2,
            synthesisTemperature: 0.2,
            synthesisMaxTokens: 2500,
            fallbackSummaryLength: 1200,
            
            // NUEVO: Configuración específica para completion
            completionModel: 'gpt-5-mini',
            completionTemperature: 1.0,  // Más determinístico para RAG
            completionMaxTokens: 3000
        };

        console.log('Inicializando Document Service para RAG optimizado...');
        this.initializeAzureSearch();
        this.initializeOpenAI();
        
        DocumentService.instance = this;
        console.log(`Document Service RAG - Search: ${this.searchAvailable}, OpenAI: ${this.openaiAvailable}`);
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
            
            console.log(`Azure Search configurado correctamente`);
            
        } catch (error) {
            console.error('Error inicializando Azure Search:', error.message);
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

            // Cliente separado para completions
            const completionBaseURL = `${azureOpenaiEndpoint}/openai/deployments/${this.config.completionModel}`;
            this.completionClient = new OpenAI({
                apiKey: azureOpenaiKey,
                baseURL: completionBaseURL,
                defaultQuery: { 'api-version': '2024-12-01-preview' },
                defaultHeaders: {
                    'api-key': azureOpenaiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 45000
            });

            this.embeddingModel = embeddingDeployment;
            this.openaiAvailable = true;
            
            console.log('Azure OpenAI configurado para embeddings y completions');

        } catch (error) {
            console.error('Error inicializando Azure OpenAI:', error.message);
            this.openaiAvailable = false;
            this.initializationError = error.message;
        }
    }

    /**
     * MÉTODO PRINCIPAL OPTIMIZADO - FLUJO RAG ESPECÍFICO
     * 1. Pregunta → 2. Embedding → 3. Azure AI Search → 4. Completion → 5. Respuesta
     */
    async buscarDocumentos(consulta, userId = 'unknown', options = {}) {
        const startTime = Date.now();
        console.log(`[${userId}] === FLUJO RAG OPTIMIZADO ===`);
        console.log(`[${userId}] Consulta: "${consulta}"`);
        
        if (!this.searchAvailable) {
            return this.crearRespuestaError('Servicio de búsqueda no disponible', this.initializationError);
        }

        try {
            // PASO 1: Limpiar y preparar consulta
            const consultaLimpia = this.limpiarConsulta(consulta);
            console.log(`[${userId}] Consulta limpia: "${consultaLimpia}"`);

            // PASO 2: Generar embedding de la consulta
            if (!this.openaiAvailable) {
                console.log(`[${userId}] OpenAI no disponible, usando búsqueda textual`);
                return await this.busquedaTextualSolamente(consultaLimpia, userId, options);
            }

            console.log(`[${userId}] PASO 2: Generando embedding...`);
            const embedding = await this.createEmbedding(consultaLimpia);

            // PASO 3: Búsqueda vectorial en Azure AI Search  
            console.log(`[${userId}] PASO 3: Búsqueda vectorial en Azure AI Search...`);
            const documentos = await this.busquedaVectorialOptimizada(embedding, consultaLimpia, userId, options);
            
            if (!documentos || documentos.length === 0) {
                console.log(`[${userId}] Sin documentos relevantes, intentando búsqueda textual`);
                return await this.busquedaTextualSolamente(consultaLimpia, userId, options);
            }

            console.log(`[${userId}] Encontrados ${documentos.length} documentos relevantes`);

            // PASO 4: Construir contexto para completion
            console.log(`[${userId}] PASO 4: Construyendo contexto...`);
            const contexto = this.construirContextoParaCompletion(documentos, consultaLimpia);

            // PASO 5: Generar respuesta con completion
            console.log(`[${userId}] PASO 5: Generando respuesta con completion...`);
            const respuestaFinal = await this.generarRespuestaConCompletion(
                consultaLimpia,
                contexto,
                documentos,
                userId
            );

            const duration = Date.now() - startTime;
            console.log(`[${userId}] RAG completado en ${duration}ms`);
            
            return respuestaFinal;

        } catch (error) {
            console.error(`[${userId}] Error en flujo RAG:`, error.message);
            return this.crearRespuestaError('Error en búsqueda de documentos', error.message);
        }
    }

    /**
     * LIMPIEZA DE CONSULTA PARA RAG
     */
    limpiarConsulta(consulta) {
        if (!consulta || typeof consulta !== 'string') {
            return 'consulta general';
        }
        
        return consulta
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\sáéíóúñü¿?¡!.,;:()\-]/gi, '')
            .substring(0, 8000); // Límite para embedding
    }

    /**
     * BÚSQUEDA VECTORIAL OPTIMIZADA - Usando tu lógica existente mejorada
     */
    async busquedaVectorialOptimizada(embedding, consulta, userId, options) {
        const config = {
            k: Math.min(options.k || this.config.maxDocumentsPerSearch, 12),
            maxPerFile: options.maxPerFile || this.config.maxDocumentsPerFile,
            minScore: options.minScore || this.config.minScoreVector
        };

        const searchResults = await this.searchClient.search("*", {
            vectorQueries: [{
                kNearestNeighborsCount: config.k * 3, // Obtener más para filtrar mejor
                fields: this.vectorField,
                vector: embedding
            }],
            select: ['Chunk', 'FileName', 'Folder'],
            top: config.k * 4,
            includeTotalCount: true
        });

        const documentos = [];
        const archivosCounts = new Map();
        let procesados = 0;

        for await (const result of searchResults.results) {
            procesados++;
            const doc = result.document || {};
            const score = Number(result.score || 0);
            const fileName = doc.FileName || '(sin nombre)';
            const rawChunk = (doc.Chunk || '').trim();

            // Aplicar tus filtros existentes
            if (!this.esChunkValido(rawChunk, score, { ...config, minScore: config.minScore }, 'vectorial')) continue;

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
                searchType: 'vectorial',
                length: cleanChunk.length
            });

            if (documentos.length >= config.k) break;
        }

        console.log(`[${userId}] Vectorial: procesados=${procesados}, seleccionados=${documentos.length}`);
        
        // Ordenar por relevancia y retornar los mejores
        return documentos
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, config.k);
    }

    /**
     * CONSTRUCCIÓN DE CONTEXTO OPTIMIZADA PARA COMPLETION
     */
    construirContextoParaCompletion(documentos, consulta) {
        let contexto = `CONSULTA DEL USUARIO: "${consulta}"\n\n`;
        contexto += `DOCUMENTOS RELEVANTES ENCONTRADOS:\n\n`;
        
        let currentLength = contexto.length;
        const maxLength = this.config.maxContextLength;

        documentos.forEach((doc, index) => {
            if (currentLength >= maxLength) return;

            const header = `--- DOCUMENTO ${index + 1}: ${doc.fileName} (Relevancia: ${(doc.relevanceScore * 100).toFixed(1)}%) ---\n`;
            const content = `${doc.chunk}\n\n`;
            
            const seccionCompleta = header + content;
            
            if (currentLength + seccionCompleta.length <= maxLength) {
                contexto += seccionCompleta;
                currentLength += seccionCompleta.length;
            } else {
                // Truncar si es necesario
                const espacioRestante = maxLength - currentLength - header.length - 50;
                if (espacioRestante > 100) {
                    contexto += header + doc.chunk.substring(0, espacioRestante) + '...[truncado]\n\n';
                }
                break;
            }
        });

        return contexto;
    }

    /**
     * GENERACIÓN DE RESPUESTA CON COMPLETION - NUEVO MÉTODO
     */
    async generarRespuestaConCompletion(consulta, contexto, documentos, userId) {
        if (!this.openaiAvailable) {
            // Fallback a tu método existente
            return this.sintetizarRespuestaFallbackMejorada(consulta, documentos, { type: 'technical_query' }, userId);
        }

        try {
            const systemPrompt = `Eres Nova-AI, asistente especializado de Nova Corporation con acceso a documentación interna.

INSTRUCCIONES CRÍTICAS:
1. Responde SIEMPRE en español
2. Basa tu respuesta EXCLUSIVAMENTE en la documentación proporcionada
3. Si la información no está en los documentos, indícalo claramente
4. Estructura tu respuesta con markdown para mayor claridad
5. Sé PRECISO, CONCRETO y ÚTIL
6. Para APIs: incluye endpoints, parámetros y ejemplos cuando estén disponibles
7. Para procedimientos: proporciona pasos claros y ordenados

FORMATO ESPERADO:
- Usa encabezados ## para secciones principales
- Usa listas para enumerar elementos o pasos
- Usa \`código\` para endpoints, parámetros o valores específicos
- Incluye ejemplos prácticos cuando sea posible`;

            const userPrompt = `${contexto}

INSTRUCCIONES ESPECÍFICAS:
- Responde directamente a la consulta usando SOLO la documentación proporcionada
- Si necesitas información adicional que no está disponible, indícalo
- Estructura la información de manera clara y útil
- Incluye referencias a los documentos cuando sea relevante

Proporciona una respuesta completa, precisa y bien estructurada.`;

            const response = await this.completionClient.chat.completions.create({
                model: this.config.completionModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: this.config.completionTemperature,
                max_tokens: this.config.completionMaxTokens,
                top_p: 0.9
            });

            let respuestaSintetizada = response.choices?.[0]?.message?.content?.trim();
            
            if (!respuestaSintetizada || respuestaSintetizada.length < 100) {
                console.warn(`[${userId}] Respuesta completion insuficiente, usando fallback`);
                return this.sintetizarRespuestaFallbackMejorada(consulta, documentos, { type: 'technical_query' }, userId);
            }

            // Agregar metadatos del procesamiento RAG
            respuestaSintetizada = this.agregarMetadatosRAG(respuestaSintetizada, documentos, response.usage);
            
            console.log(`[${userId}] Completion exitoso (${respuestaSintetizada.length} chars)`);
            return respuestaSintetizada;

        } catch (error) {
            console.error(`[${userId}] Error en completion:`, error.message);
            return this.sintetizarRespuestaFallbackMejorada(consulta, documentos, { type: 'technical_query' }, userId);
        }
    }

    /**
     * AGREGAR METADATOS RAG A LA RESPUESTA
     */
    agregarMetadatosRAG(respuesta, documentos, usage) {
        const fuentes = [...new Set(documentos.map(d => d.fileName))];
        const avgRelevance = documentos.reduce((sum, doc) => sum + doc.relevanceScore, 0) / documentos.length;
        
        respuesta += `\n\n---\n\n`;
        respuesta += `📚 **Fuentes**: ${fuentes.join(', ')}${fuentes.length < documentos.length ? ` y ${documentos.length - fuentes.length} más` : ''}`;
        respuesta += `\n🎯 **Relevancia promedio**: ${(avgRelevance * 100).toFixed(1)}%`;
        respuesta += `\n🤖 **Procesado con**: ${this.config.completionModel} (RAG optimizado)`;
        
        if (usage) {
            respuesta += `\n⚡ **Tokens**: ${usage.completion_tokens} generados, ${usage.prompt_tokens} entrada`;
        }

        return respuesta;
    }

    /**
     * BÚSQUEDA TEXTUAL COMO FALLBACK - Usando tu método existente
     */
    async busquedaTextualSolamente(consulta, userId, options) {
        try {
            console.log(`[${userId}] Ejecutando búsqueda textual fallback...`);
            const queryOptimizada = this.optimizarQueryTextual(consulta, { type: 'general' });

            const searchResults = await this.searchClient.search(queryOptimizada, {
                select: ['Chunk', 'FileName', 'Folder', 'Estado'],
                top: (options.k || this.config.maxDocumentsPerSearch) * 4,
                searchMode: 'all',
                queryType: 'full',
                searchFields: ['Chunk', 'FileName', 'Folder']
            });

            const config = {
                k: Math.min(options.k || this.config.maxDocumentsPerSearch, 12),
                maxPerFile: options.maxPerFile || this.config.maxDocumentsPerFile,
                minScore: this.config.minScoreText
            };

            const documentos = await this.procesarResultadosBusqueda(searchResults, config, userId, 'textual');
            
            if (!documentos || documentos.length === 0) {
                return this.crearRespuestaSinResultados(consulta, { type: 'general', intent: 'info' }, userId);
            }

            return this.sintetizarRespuestaFallbackMejorada(consulta, documentos, { type: 'general' }, userId);

        } catch (error) {
            console.error(`[${userId}] Error en búsqueda textual:`, error.message);
            throw error;
        }
    }

    // ==================== MÉTODOS EXISTENTES (manteniendo tu lógica) ====================

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

            console.log(`[${userId}] ${tipoSearch}: procesados=${procesados}, seleccionados=${documentos.length}`);
            return documentos;

        } catch (error) {
            console.error(`[${userId}] Error procesando resultados ${tipoSearch}:`, error.message);
            return [];
        }
    }

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

    limpiarYOptimizarChunk(chunk) {
        return chunk
            .replace(/\s+/g, ' ')           // Normalizar espacios
            .replace(/\n{3,}/g, '\n\n')     // Limitar saltos de línea
            .replace(/[^\w\s\n.,;:()\-áéíóúñü¿?¡!]/gi, '') // Mantener caracteres útiles
            .trim();
    }

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

    sintetizarRespuestaFallbackMejorada(consulta, documentos, analysis, userId) {
        console.log(`[${userId}] Usando síntesis fallback mejorada`);

        let respuesta = `**${analysis.intent === 'definition' ? 'Definición' : 'Información'} sobre: "${consulta}"**\n\n`;

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
        respuesta += `**Análisis de cobertura**: ${cobertura}\n\n`;

        // Metadatos
        respuesta += `---\n\n`;
        respuesta += `**Documentos procesados**: ${documentos.length}`;
        respuesta += `\n**Tipo de búsqueda**: ${documentos[0]?.searchType || 'textual'}`;
        respuesta += `\n**Método**: Síntesis automática (sin IA)`;

        return respuesta;
    }

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
            console.error('Error creando embedding:', error.message);
            
            // Reintentar una vez en caso de error temporal
            if (!error.retried) {
                console.log('Reintentando creación de embedding...');
                error.retried = true;
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.createEmbedding(text);
            }
            
            throw error;
        }
    }

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
        console.log(`Query optimizada: "${query}" → "${finalQuery}"`);
        return finalQuery;
    }

    crearRespuestaError(titulo, detalle) {
        return `**${titulo}**\n\n` +
               `**Error**: ${detalle}\n\n` +
               `**Sugerencias**:\n` +
               `• Verifica la configuración de Azure Search\n` +
               `• Revisa las variables de entorno\n` +
               `• Contacta al administrador del sistema si persiste\n\n` +
               `**Servicio**: DocumentService RAG optimizado`;
    }

    crearRespuestaSinResultados(consulta, analysis, userId) {
        const sugerencias = this.generarSugerenciasBusqueda(consulta, analysis);
        
        return `**Búsqueda realizada**: "${consulta}"\n\n` +
               `Sin resultados relevantes encontrados en el índice.\n\n` +
               `**Sugerencias**:\n${sugerencias}\n\n` +
               `**Detalles técnicos**:\n` +
               `• Índice consultado: ${this.indexName}\n` +
               `• Tipo de búsqueda: ${this.openaiAvailable ? 'Vectorial + Textual' : 'Solo textual'}\n` +
               `• Análisis de consulta: ${analysis.type} (${analysis.intent})`;
    }

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

        sugerencias.push('• Verifica la ortografía y acentos');
        
        return sugerencias.join('\n');
    }

    getConfigInfo() {
        return {
            searchAvailable: this.searchAvailable,
            openaiAvailable: this.openaiAvailable,
            indexName: this.indexName || 'No configurado',
            vectorField: this.vectorField || 'No configurado',
            embeddingModel: this.embeddingModel || 'No configurado',
            completionModel: this.config.completionModel,
            error: this.initializationError,
            version: '3.0.0-rag-optimized',
            config: {
                maxDocumentsPerSearch: this.config.maxDocumentsPerSearch,
                maxContextLength: this.config.maxContextLength,
                completionTemperature: this.config.completionTemperature,
                minScoreVector: this.config.minScoreVector
            },
            features: {
                ragOptimizedPipeline: true,
                embeddingGeneration: this.openaiAvailable,
                vectorSearch: this.searchAvailable,
                aiCompletion: this.openaiAvailable,
                fallbackProcessing: true,
                contextOptimization: true,
                relevanceScoring: true
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
            aiCompletion: this.openaiAvailable ? 'Azure OpenAI' : 'Fallback automático',
            processingVersion: '3.0.0-rag-optimized',
            pipeline: [
                'Consulta → Embedding → Vector Search → Context Building → AI Completion → Response'
            ],
            features: [
                'Flujo RAG específico optimizado',
                'Embedding automático de consultas',
                'Búsqueda vectorial prioritaria',
                'Construcción inteligente de contexto',
                'Completion con temperatura baja',
                'Fallback a búsqueda textual',
                'Metadatos enriquecidos'
            ]
        };
    }

    cleanup() {
        console.log('DocumentService RAG optimizado - Limpieza completada');
    }

    async testConnection() {
        if (!this.searchAvailable) {
            console.log('Azure Search no disponible para testing');
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

            console.log(`Test de conexión Azure Search: ${hasResults ? 'OK con datos' : 'OK sin datos'}`);
            return true;

        } catch (error) {
            console.error('Error en test de conexión:', error.message);
            return false;
        }
    }

    async testEmbeddingConnection() {
        if (!this.openaiAvailable) {
            console.log('Azure OpenAI no disponible para testing embeddings');
            return false;
        }

        try {
            const testEmbedding = await this.createEmbedding("test embedding");
            const isValid = Array.isArray(testEmbedding) && testEmbedding.length > 1000;
            
            console.log(`Test de embeddings: ${isValid ? 'OK' : 'Respuesta inválida'}`);
            return isValid;

        } catch (error) {
            console.error('Error en test de embeddings:', error.message);
            return false;
        }
    }

    /**
     * MÉTODO DE PRUEBA DEL FLUJO RAG COMPLETO
     */
    async testRAGPipeline(testQuery = "¿Qué es la API ValidaSocio?") {
        console.log('=== INICIANDO TEST DEL PIPELINE RAG ===');
        
        try {
            const startTime = Date.now();
            const result = await this.buscarDocumentos(testQuery, 'test-user');
            const duration = Date.now() - startTime;
            
            const isSuccess = result && typeof result === 'string' && result.length > 100;
            
            console.log(`Test RAG ${isSuccess ? 'EXITOSO' : 'FALLIDO'} en ${duration}ms`);
            
            return {
                success: isSuccess,
                query: testQuery,
                resultLength: result?.length || 0,
                duration,
                preview: isSuccess ? result.substring(0, 200) + '...' : result
            };
            
        } catch (error) {
            console.error('Test RAG falló:', error.message);
            return {
                success: false,
                error: error.message,
                query: testQuery
            };
        }
    }
}

// Crear instancia singleton
const documentService = new DocumentService();
module.exports = documentService;