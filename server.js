process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const MONGODB_URI = "mongodb+srv://m64000591_db_user:4LlkbQ52fEXhmVuZ@cluster0.ks0uirc.mongodb.net/?retryWrites=true&w=majority";
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

let db, quizCollection, resultsCollection;

MongoClient.connect(MONGODB_URI)
  .then(client => {
    db = client.db('daler_quiz');
    quizCollection = db.collection('quiz_data');
    resultsCollection = db.collection('results');
    console.log("MongoDB muvaffaqiyatli ulandi!");

    app.listen(PORT, () => {
      console.log(`Server ishga tushdi: port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("MongoDB ulanish xatosi:", err);
    process.exit(1);
  });

const verifyAdmin = (req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (key === ADMIN_KEY) {
    next();
  } else {
    res.status(403).json({ error: "Parol noto'g'ri" });
  }
};

app.get('/api/quiz', async (req, res) => {
  try {
    let data = await quizCollection.findOne({ type: 'main' });
    if (!data) {
      data = {
        type: 'main',
        topics: ["Umumiy"],
        q: [["Namunaviy savol?", ["A", "B", "C", "D"], 0]],
        qt: [0],
        w: [["TEST", 0, 0, "h", "Namunaviy izoh"]]
      };
      await quizCollection.insertOne(data);
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/quiz', verifyAdmin, async (req, res) => {
  try {
    let data = await quizCollection.findOne({ type: 'main' });
    res.json(data || { topics: [], q: [], qt: [], w: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/quiz', verifyAdmin, async (req, res) => {
  try {
    const newData = req.body;
    delete newData._id;
    newData.type = 'main';
    
    await quizCollection.updateOne(
      { type: 'main' },
      { $set: newData },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/results', async (req, res) => {
  try {
    const result = {
      id: Date.now().toString(),
      name: req.body.name || 'Nomaʼlum',
      test: req.body.test || 0,
      cw: req.body.cw || 0,
      sec: req.body.sec || 0,
      base: req.body.base || 0,
      total: req.body.total || 0,
      ts: new Date()
    };
    await resultsCollection.insertOne(result);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/results', async (req, res) => {
  try {
    const results = await resultsCollection.find({}).sort({ total: -1 }).toArray();
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/results/:id', verifyAdmin, async (req, res) => {
  try {
    await resultsCollection.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/results', verifyAdmin, async (req, res) => {
  try {
    await resultsCollection.deleteMany({});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
