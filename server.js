const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

const TIMEOUT = 30000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await axios.get(url, {
                headers: { 
                    'User-Agent': USER_AGENT,
                    'Accept': 'application/json'
                },
                timeout: TIMEOUT
            });
            return response;
        } catch (err) {
            if (i === retries) throw err;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

// Múltiplas APIs para fallback
async function fetchVideoInfo(url) {
    const apis = [
        `https://tikwm.com/api/?url=${encodeURIComponent(url)}`,
        `https://tikdownloader.io/api/ajaxSearch?q=${encodeURIComponent(url)}`,
        `https://api.tikmate.app/api/lookup?url=${encodeURIComponent(url)}`
    ];
    
    for (const apiUrl of apis) {
        try {
            const response = await fetchWithRetry(apiUrl);
            if (response.data && (response.data.code === 0 || response.data.data)) {
                return response.data;
            }
        } catch (err) {
            console.log(`API falhou: ${apiUrl}`);
        }
    }
    throw new Error('Todas as APIs falharam');
}

// Endpoint: Informações do usuário
app.get('/api/user/info', async (req, res) => {
    const { unique_id } = req.query;
    if (!unique_id) {
        return res.status(400).json({ error: 'unique_id é obrigatório' });
    }
    
    const cacheKey = `user_info_${unique_id}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return res.json(cached.data);
    }
    
    try {
        const apiUrl = `https://tikwm.com/api/user/info?unique_id=${encodeURIComponent(unique_id)}`;
        const response = await fetchWithRetry(apiUrl);
        
        if (response.data && response.data.code === 0) {
            cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
            return res.json(response.data);
        }
        throw new Error('Resposta inválida da API');
    } catch (error) {
        console.error('Erro:', error.message);
        res.status(500).json({ error: 'Erro ao buscar informações do usuário', code: -1 });
    }
});

// Endpoint: Posts do usuário
app.get('/api/user/posts', async (req, res) => {
    const { unique_id, cursor = 0, count = 21 } = req.query;
    if (!unique_id) {
        return res.status(400).json({ error: 'unique_id é obrigatório' });
    }
    
    const cacheKey = `user_posts_${unique_id}_${cursor}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return res.json(cached.data);
    }
    
    try {
        const apiUrl = `https://tikwm.com/api/user/posts?unique_id=${encodeURIComponent(unique_id)}&count=${count}&cursor=${cursor}`;
        const response = await fetchWithRetry(apiUrl);
        
        if (response.data && response.data.code === 0) {
            cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
            return res.json(response.data);
        }
        throw new Error('Resposta inválida da API');
    } catch (error) {
        console.error('Erro:', error.message);
        res.status(500).json({ error: 'Erro ao buscar vídeos do usuário', code: -1 });
    }
});

// Endpoint: Resolver link de vídeo (CORRIGIDO)
app.get('/api/video/info', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'url é obrigatória' });
    }
    
    const cacheKey = `video_info_${Buffer.from(url).toString('base64')}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return res.json(cached.data);
    }
    
    try {
        // Tentativa 1: API principal
        let response = await fetchWithRetry(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`);
        
        if (response.data && response.data.code === 0 && response.data.data) {
            const result = {
                code: 0,
                data: {
                    video_id: response.data.data.video_id,
                    title: response.data.data.title,
                    cover: response.data.data.cover,
                    play: response.data.data.play,
                    hdplay: response.data.data.hdplay,
                    wmplay: response.data.data.wmplay,
                    duration: response.data.data.duration,
                    play_count: response.data.data.play_count,
                    digg_count: response.data.data.digg_count,
                    comment_count: response.data.data.comment_count,
                    author: response.data.data.author,
                    music: response.data.data.music
                }
            };
            cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return res.json(result);
        }
        
        // Tentativa 2: API alternativa
        const altUrl = `https://tikdownloader.io/api/ajaxSearch?q=${encodeURIComponent(url)}`;
        const altResponse = await fetchWithRetry(altUrl);
        
        if (altResponse.data && altResponse.data.video_url) {
            const result = {
                code: 0,
                data: {
                    video_id: Date.now().toString(),
                    title: altResponse.data.title || 'Vídeo TikTok',
                    cover: altResponse.data.thumbnail || '',
                    play: altResponse.data.video_url || altResponse.data.video_url_no_wm,
                    hdplay: altResponse.data.video_url_hd || altResponse.data.video_url,
                    duration: altResponse.data.duration || 0,
                    play_count: altResponse.data.views || 0,
                    digg_count: altResponse.data.likes || 0,
                    author: { unique_id: 'usuario', nickname: 'Usuário' }
                }
            };
            cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return res.json(result);
        }
        
        throw new Error('Não foi possível obter informações do vídeo');
    } catch (error) {
        console.error('Erro ao resolver vídeo:', error.message);
        res.status(500).json({ error: 'Erro ao buscar informações do vídeo', code: -1 });
    }
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

// Limpar cache a cada hora
setInterval(() => {
    cache.clear();
    console.log('🗑️ Cache limpo');
}, 60 * 60 * 1000);

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔════════════════════════════════════════╗
    ║     🚀 AhaTik Downloader Rodando!      ║
    ╠════════════════════════════════════════╣
    ║  📱 Local: http://localhost:${PORT}     ║
    ║  🌐 Rede: http://SEU_IP_VPS:${PORT}     ║
    ╚════════════════════════════════════════╝
    `);
});
