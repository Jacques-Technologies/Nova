// services/documentService.js - RAG UNIFICADO Y MEJORADO
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

        console.log('🔍 Inicializando Document Service...');
        this.initializeAzureSearch();
        this.initializeOpenAI();
        
        DocumentService.instance = this;
        console.log(`✅ Document Service inicializado - Search: ${this.searchAvailable}, OpenAI: ${this.openaiAvailable}`);
    }

    // ... [Métodos de inicialización existentes - mantener iguales]
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

    // ... [Métodos de test y embedding existentes - mantener iguales]

    /**
     * ✅ NUEVO: Método principal UNIFICADO que retorna respuesta sintetizada
     * En lugar de formatear chunks por separado, genera una respuesta cohesiva
     */
    async buscarDocumentos(consulta, userId = 'unknown') {
        console.log(`🚀 [${userId}] === BÚSQUEDA DOCUMENTOS UNIFICADA ===`);
        console.log(`🔍 [${userId}] Consulta: "${consulta}"`);
        
        if (!this.searchAvailable) {
            const errorMsg = `⚠️ **Servicio de búsqueda no disponible**\n\n${this.initializationError || 'Azure Search no configurado'}`;
            return errorMsg;
        }

        try {
            // 1) Buscar documentos usando RAG mejorado
            const resultadosRaw = await this.buscarDocumentosRaw(consulta, userId, {
                k: 8,
                kNeighbors: 20,
                maxPerFile: 3
            });

            if (!resultadosRaw || resultadosRaw.length === 0) {
                console.log(`❌ [${userId}] No se encontraron documentos`);
                return this.sinResultados(consulta, userId);
            }

            // 2) ✅ NUEVA FUNCIÓN: Sintetizar respuesta unificada
            const respuestaUnificada = await this.sintetizarRespuesta(consulta, resultadosRaw, userId);
            
            console.log(`✅ [${userId}] Respuesta unificada generada (${respuestaUnificada.length} chars)`);
            return respuestaUnificada;

        } catch (error) {
            console.error(`❌ [${userId}] Error en búsqueda:`, error.message);
            return `❌ **Error en búsqueda de documentos**: ${error.message}`;
        }
    }

    /**
     * ✅ NUEVA FUNCIÓN: Sintetizar respuesta unificada usando OpenAI
     * Combina múltiples chunks en una respuesta coherente y concisa
     */
    async sintetizarRespuesta(consulta, resultadosRaw, userId) {
        console.log(`🧠 [${userId}] Sintetizando respuesta con ${resultadosRaw.length} documentos...`);

        // Si no hay OpenAI disponible, usar método fallback
        if (!this.openaiAvailable) {
            return this.sintetizarRespuestaFallback(consulta, resultadosRaw, userId);
        }

        try {
            // Construir contexto optimizado
            const contexto = this.construirContextoOptimizado(resultadosRaw);
            
            const systemPrompt = `Eres NOVA-AI, asistente especializado en documentación técnica de Nova Corporation.

INSTRUCCIONES CRÍTICAS:
1. Responde SIEMPRE en español
2. Basa tu respuesta ÚNICAMENTE en los documentos proporcionados
3. Sintetiza la información en una respuesta UNIFICADA y CONCISA
4. NO repitas información, COMBÍNALA inteligentemente
5. Estructura la respuesta con markdown para fácil lectura
6. Si hay endpoints o APIs, presenta una lista organizada
7. Si hay procedimientos, explícalos paso a paso
8. Cita las fuentes al final de forma resumida

FORMATO DE RESPUESTA:
- Respuesta directa a la pregunta
- Información organizada y estructurada
- Fuentes consultadas al final`;

            const userPrompt = `**PREGUNTA DEL USUARIO:**
${consulta}

**DOCUMENTOS ENCONTRADOS:**
${contexto}

**TAREA:**
Proporciona una respuesta UNIFICADA que sintetice toda la información relevante de los documentos para responder la pregunta. No presentes los documentos por separado, sino combina la información en una sola respuesta coherente.`;

            const response = await this.openaiClient.chat.completions.create({
                model: 'gpt-5-mini', // Usar el modelo configurado
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3, // Baja temperatura para respuestas más precisas
                max_tokens: 2000,
                top_p: 0.9
            });

            let respuestaSintetizada = response.choices?.[0]?.message?.content?.trim();
            
            if (!respuestaSintetizada || respuestaSintetizada.length < 50) {
                console.warn(`⚠️ [${userId}] Respuesta de OpenAI muy corta, usando fallback`);
                return this.sintetizarRespuestaFallback(consulta, resultadosRaw, userId);
            }

            // Agregar metadatos de fuentes
            const fuentes = [...new Set(resultadosRaw.map(r => r.fileName).filter(Boolean))];
            const carpetas = [...new Set(resultadosRaw.map(r => r.folder).filter(Boolean))];
            
            respuestaSintetizada += `\n\n---\n\n`;
            respuestaSintetizada += `📚 **Fuentes**: ${fuentes.slice(0, 3).join(', ')}${fuentes.length > 3 ? ` y ${fuentes.length - 3} más` : ''}`;
            if (carpetas.length) respuestaSintetizada += `\n📁 **Carpetas**: ${carpetas.join(', ')}`;
            respuestaSintetizada += `\n🤖 **Procesado con**: Azure AI Search + OpenAI`;

            console.log(`✅ [${userId}] Síntesis completada exitosamente`);
            return respuestaSintetizada;

        } catch (error) {
            console.error(`❌ [${userId}] Error en síntesis OpenAI:`, error.message);
            return this.sintetizarRespuestaFallback(consulta, resultadosRaw, userId);
        }
    }

    /**
     * ✅ Construir contexto optimizado para OpenAI
     * Limita el tamaño y mejora la estructura
     */
    construirContextoOptimizado(resultadosRaw) {
        if (!Array.isArray(resultadosRaw) || resultadosRaw.length === 0) return '';

        let contexto = '';
        const maxContextLength = 8000; // Límite de caracteres para el contexto
        let currentLength = 0;

        resultadosRaw.forEach((doc, index) => {
            if (currentLength >= maxContextLength) return;

            const header = `DOCUMENTO ${index + 1} (${doc.fileName || 'sin-nombre'}):`;
            const content = doc.chunk || '';
            
            // Truncar el contenido si es muy largo
            const maxChunkLength = Math.min(1500, maxContextLength - currentLength - header.length);
            const truncatedContent = content.length > maxChunkLength 
                ? content.substring(0, maxChunkLength) + '...[truncado]'
                : content;

            const docSection = `${header}\n${truncatedContent}\n\n`;
            
            if (currentLength + docSection.length <= maxContextLength) {
                contexto += docSection;
                currentLength += docSection.length;
            }
        });

        return contexto;
    }

    /**
     * ✅ Método fallback cuando OpenAI no está disponible
     * Crea una respuesta estructurada sin IA
     */
    sintetizarRespuestaFallback(consulta, resultadosRaw, userId) {
        console.log(`🔄 [${userId}] Usando síntesis fallback (sin OpenAI)`);

        let respuesta = `🔍 **Información encontrada para: "${consulta}"**\n\n`;

        // Agrupar por archivo para evitar repetición
        const porArchivo = new Map();
        resultadosRaw.forEach(doc => {
            const fileName = doc.fileName || 'Documento sin nombre';
            if (!porArchivo.has(fileName)) {
                porArchivo.set(fileName, []);
            }
            porArchivo.get(fileName).push(doc.chunk || '');
        });

        // Combinar información por archivo
        let archivoIndex = 1;
        for (const [fileName, chunks] of porArchivo) {
            if (archivoIndex <= 3) { // Limitar a 3 archivos principales
                respuesta += `### 📄 ${fileName}\n\n`;
                
                // Combinar chunks del mismo archivo
                const textoCompleto = chunks.join(' ').trim();
                const resumen = textoCompleto.length > 800 
                    ? textoCompleto.substring(0, 800) + '...'
                    : textoCompleto;
                
                respuesta += `${resumen}\n\n`;
                archivoIndex++;
            }
        }

        // Metadatos
        const totalArchivos = porArchivo.size;
        const totalChunks = resultadosRaw.length;
        
        respuesta += `---\n\n`;
        respuesta += `📊 **Resumen**: ${totalChunks} secciones de ${totalArchivos} documento(s)`;
        respuesta += `\n🤖 **Búsqueda**: Azure AI Search`;

        return respuesta;
    }

    /**
     * ✅ MEJORADO: buscarDocumentosRaw con mejor filtrado
     */
    async buscarDocumentosRaw(consulta, userId = 'unknown', options = {}) {
        console.log(`🚀 [${userId}] === BÚSQUEDA RAW MEJORADA ===`);
        
        if (!this.searchAvailable) {
            throw new Error(this.initializationError || 'Azure Search no configurado');
        }

        const {
            k = 6,
            kNeighbors = 20,
            select = ['Chunk', 'FileName', 'Folder'],
            maxPerFile = 2
        } = options;

        const consultaSanitizada = this.sanitizeQuery(consulta);
        let resultados = [];
        
        // Estrategia 1: Búsqueda vectorial si está disponible
        if (this.openaiAvailable) {
            try {
                const vector = await this.createEmbedding(consulta);
                
                const vectorResults = await this.searchClient.search("*", {
                    vectorQueries: [{
                        kNearestNeighborsCount: kNeighbors,
                        fields: this.vectorField,
                        vector
                    }],
                    select,
                    top: k * 3,
                    includeTotalCount: true
                });
                
                resultados = await this.procesarResultadosRAG(vectorResults, k, maxPerFile, userId);
                
                if (resultados.length > 0) {
                    console.log(`✅ [${userId}] Búsqueda vectorial exitosa: ${resultados.length} docs`);
                    return resultados;
                }
            } catch (error) {
                console.warn(`⚠️ [${userId}] Búsqueda vectorial falló: ${error.message}`);
            }
        }

        // Estrategia 2: Búsqueda textual
        try {
            const textResults = await this.searchClient.search(consultaSanitizada, {
                select,
                top: k * 4,
                searchMode: 'any',
                queryType: 'simple',
                includeTotalCount: true
            });
            
            resultados = await this.procesarResultadosRAG(textResults, k, maxPerFile, userId);
            console.log(`✅ [${userId}] Búsqueda textual: ${resultados.length} docs`);
            
        } catch (error) {
            console.error(`❌ [${userId}] Error en búsqueda textual:`, error.message);
            throw error;
        }

        return resultados;
    }

    /**
     * ✅ Procesador mejorado de resultados RAG
     */
    async procesarResultadosRAG(searchResults, k, maxPerFile, userId) {
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
                
                // Filtros de calidad
                if (!chunk || chunk.length < 20) continue;
                if (score > 0 && score < 0.5) continue; // Filtrar scores muy bajos
                
                // Control por archivo
                const count = porArchivo.get(fileName) || 0;
                if (count >= maxPerFile) continue;
                porArchivo.set(fileName, count + 1);
                
                resultados.push({
                    fileName,
                    folder: doc.Folder || '',
                    chunk,
                    score,
                    quality: this.evaluarCalidadChunk(chunk, score)
                });
                
                if (resultados.length >= k) break;
            }
            
            // Ordenar por calidad y score
            resultados.sort((a, b) => (b.quality + b.score) - (a.quality + a.score));
            
            console.log(`📊 [${userId}] Procesados: ${procesados}, seleccionados: ${resultados.length}`);
            return resultados;
            
        } catch (error) {
            console.error(`❌ [${userId}] Error procesando resultados:`, error.message);
            return [];
        }
    }

    /**
     * ✅ Evaluar calidad de un chunk
     */
    evaluarCalidadChunk(chunk, score) {
        let quality = 0;
        
        // Longitud apropiada
        if (chunk.length >= 100 && chunk.length <= 2000) quality += 0.3;
        
        // Contiene información estructurada
        if (chunk.includes(':') || chunk.includes('•') || chunk.includes('-')) quality += 0.2;
        
        // No es solo metadata
        if (!chunk.toLowerCase().includes('confidencial') && 
            !chunk.toLowerCase().includes('página') &&
            !chunk.toLowerCase().includes('page')) quality += 0.2;
        
        // Contiene información técnica útil
        if (chunk.includes('api') || chunk.includes('endpoint') || 
            chunk.includes('método') || chunk.includes('parámetro')) quality += 0.3;
            
        return Math.min(quality, 1.0);
    }

    /**
     * ✅ Mantener métodos existentes necesarios
     */
    sanitizeQuery(query) {
        if (!query || typeof query !== 'string') {
            return '*';
        }

        let sanitized = query
            .replace(/[+\-&|!(){}[\]^"~*?:\\]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!sanitized) return '*';

        const words = sanitized.split(' ').filter(word => word.length > 0);
        const cleanWords = words.map(word => {
            word = word.replace(/^[^a-zA-Z0-9áéíóúñü]+|[^a-zA-Z0-9áéíóúñü]+$/g, '');
            return word.length < 2 ? null : word;
        }).filter(Boolean);

        if (cleanWords.length === 0) return '*';
        
        const finalQuery = cleanWords.join(' ');
        console.log(`🧹 Query sanitizada: "${query}" → "${finalQuery}"`);
        return finalQuery;
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

            const result = await this.openaiClient.embeddings.create({
                input: cleanText
            });
            
            if (!result?.data?.[0]?.embedding) {
                throw new Error('No se recibió embedding válido');
            }
            
            return result.data[0].embedding;
                
        } catch (error) {
            console.error('❌ Error creando embedding:', error.message);
            throw error;
        }
    }

    sinResultados(consulta, userId) {
        return `🔍 **Búsqueda: "${consulta}"**\n\n` +
               `❌ No se encontraron documentos relevantes en el índice.\n\n` +
               `💡 **Sugerencias:**\n` +
               `• Intenta con términos más generales\n` +
               `• Verifica la ortografía\n` +
               `• Usa sinónimos o palabras relacionadas\n\n` +
               `📊 **Índice consultado:** ${this.indexName}\n` +
               `🔧 **Tipo de búsqueda:** ${this.openaiAvailable ? 'Híbrida (Vector + Texto)' : 'Solo texto'}`;
    }

    // Métodos de utilidad existentes
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
                unifiedResponse: true,
                aiSynthesis: this.openaiAvailable
            }
        };
    }
}

// Crear instancia singleton
const documentService = new DocumentService();
module.exports = documentService;