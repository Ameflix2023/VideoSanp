const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// Configurações
const TIMEOUT = 30000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Cache simples para evitar muitas requisições
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Função para fazer requisição com retry
async function fetchWithRetry(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await axios.get(url, {
                headers: { 'User-Agent': USER_AGENT },
                timeout: TIMEOUT
            });
            return response;
        } catch (err) {
            if (i === retries) throw err;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
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
        
        cache.set(cacheKey, {
            data: response.data,
            timestamp: Date.now()
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('Erro ao buscar user info:', error.message);
        res.status(500).json({ error: 'Erro ao buscar informações do usuário', code: -1 });
    }
});

// Endpoint: Posts do usuário (com paginação)
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
        
        cache.set(cacheKey, {
            data: response.data,
            timestamp: Date.now()
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('Erro ao buscar posts:', error.message);
        res.status(500).json({ error: 'Erro ao buscar vídeos do usuário', code: -1 });
    }
});

// Endpoint: Resolver link de vídeo (encurtado ou direto)
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
        const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}`;
        const response = await fetchWithRetry(apiUrl);
        
        cache.set(cacheKey, {
            data: response.data,
            timestamp: Date.now()
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('Erro ao resolver vídeo:', error.message);
        res.status(500).json({ error: 'Erro ao buscar informações do vídeo', code: -1 });
    }
});

// Endpoint: Proxy para download direto do vídeo
app.get('/api/download', async (req, res) => {
    const { video_url } = req.query;
    
    if (!video_url) {
        return res.status(400).json({ error: 'video_url é obrigatório' });
    }
    
    try {
        const response = await axios({
            method: 'GET',
            url: video_url,
            responseType: 'stream',
            headers: { 'User-Agent': USER_AGENT },
            timeout: TIMEOUT
        });
        
        res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
        response.data.pipe(res);
    } catch (error) {
        console.error('Erro ao baixar vídeo:', error.message);
        res.status(500).json({ error: 'Erro ao baixar vídeo' });
    }
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Limpar cache a cada hora
setInterval(() => {
    cache.clear();
    console.log('Cache limpo');
}, 60 * 60 * 1000);

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📱 Acesse no navegador: http://SEU_IP_VPS:${PORT}`);
});