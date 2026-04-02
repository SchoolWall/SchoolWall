require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '3371003529zsh.';

// 数据文件
const dataFile = './posts.json';
let posts = [];
let id = 1;
let replyId = 1;

// 加载数据
if (fs.existsSync(dataFile)) {
    try {
        const content = fs.readFileSync(dataFile, 'utf8');
        if (content.trim()) {
            posts = JSON.parse(content);
            id = Math.max(...posts.map(p => p.id), 0) + 1;
            // 获取最大回复ID
            let maxReplyId = 0;
            posts.forEach(p => {
                if (p.replies && p.replies.length) {
                    maxReplyId = Math.max(maxReplyId, ...p.replies.map(r => r.id));
                }
            });
            replyId = maxReplyId + 1;
        }
    } catch(e) {
        posts = [];
    }
}

function savePosts() {
    fs.writeFileSync(dataFile, JSON.stringify(posts, null, 2));
}

// 创建目录
if (!fs.existsSync('./public')) fs.mkdirSync('./public');
if (!fs.existsSync('./public/uploads')) fs.mkdirSync('./public/uploads');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './public/uploads'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { files: 6, fileSize: 5 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static('./public'));
app.use('/uploads', express.static('./public/uploads'));

// 获取已通过的帖子（包含回帖）
app.get('/api/posts', (req, res) => {
    const approved = posts.filter(p => p.status === 'approved').sort((a,b) => b.id - a.id);
    res.json(approved);
});

// 管理员获取所有
app.get('/api/admin/posts', (req, res) => {
    const pwd = req.headers['admin-password'];
    if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: '密码错误' });
    res.json(posts.sort((a,b) => b.id - a.id));
});

// 发布帖子
app.post('/api/posts', upload.array('images', 6), (req, res) => {
    const { content, nickname } = req.body;
    
    if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: '内容不能为空' });
    }
    if (content.length > 500) {
        return res.status(400).json({ error: '内容不能超过500字' });
    }
    
    const images = req.files ? req.files.map(f => '/uploads/' + f.filename) : [];
    const newPost = {
        id: id++,
        nickname: (nickname && nickname.trim()) ? nickname.trim() : '匿名',
        content: content.trim(),
        images: images,
        likes: 0,
        replies: [],
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    posts.push(newPost);
    savePosts();
    res.json({ success: true, message: '已提交，等待审核' });
});

// 点赞
app.post('/api/posts/:id/like', (req, res) => {
    const post = posts.find(p => p.id == req.params.id && p.status === 'approved');
    if (post) {
        post.likes += 1;
        savePosts();
        res.json({ likes: post.likes });
    } else {
        res.status(404).json({ error: '帖子不存在' });
    }
});

// 发布回帖
app.post('/api/posts/:id/reply', (req, res) => {
    const { content, nickname } = req.body;
    const postId = parseInt(req.params.id);
    const post = posts.find(p => p.id === postId && p.status === 'approved');
    
    if (!post) {
        return res.status(404).json({ error: '帖子不存在' });
    }
    if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: '回复内容不能为空' });
    }
    if (content.length > 300) {
        return res.status(400).json({ error: '回复不能超过300字' });
    }
    
    const newReply = {
        id: replyId++,
        nickname: (nickname && nickname.trim()) ? nickname.trim() : '匿名',
        content: content.trim(),
        likes: 0,
        createdAt: new Date().toISOString()
    };
    
    if (!post.replies) post.replies = [];
    post.replies.push(newReply);
    savePosts();
    res.json({ success: true, message: '回复成功', reply: newReply });
});

// 给回帖点赞
app.post('/api/posts/:postId/reply/:replyId/like', (req, res) => {
    const post = posts.find(p => p.id == req.params.postId && p.status === 'approved');
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    
    const reply = post.replies.find(r => r.id == req.params.replyId);
    if (!reply) return res.status(404).json({ error: '回复不存在' });
    
    reply.likes += 1;
    savePosts();
    res.json({ likes: reply.likes });
});

// 管理员审核
app.post('/api/admin/posts/:id/audit', (req, res) => {
    const pwd = req.headers['admin-password'];
    if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: '密码错误' });
    
    const { action } = req.body;
    const index = posts.findIndex(p => p.id == req.params.id);
    
    if (index === -1) return res.status(404).json({ error: '帖子不存在' });
    
    if (action === 'approve') {
        posts[index].status = 'approved';
        savePosts();
        res.json({ success: true, message: '已通过' });
    } else if (action === 'reject') {
        posts.splice(index, 1);
        savePosts();
        res.json({ success: true, message: '已拒绝' });
    } else {
        res.status(400).json({ error: '无效操作' });
    }
});

app.listen(PORT, () => {
    console.log('\n=================================');
    console.log('✅ 校园墙已启动');
    console.log('📱 访问地址: http://localhost:' + PORT);
    console.log('🔐 管理员密码: ' + ADMIN_PASSWORD);
    console.log('=================================\n');
});