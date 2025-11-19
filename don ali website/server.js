const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Create uploads directories ---
const uploadsDir = path.join(__dirname, 'uploads');
const videosDir = path.join(uploadsDir, 'videos');
const postersDir = path.join(uploadsDir, 'posters');

[uploadsDir, videosDir, postersDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// --- Multer configuration for file uploads ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'video') {
      cb(null, videosDir);
    } else if (file.fieldname === 'poster') {
      cb(null, postersDir);
    } else {
      cb(null, uploadsDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      if (file.mimetype === 'video/mp4') {
        cb(null, true);
      } else {
        cb(new Error('Only MP4 video files are allowed'));
      }
    } else if (file.fieldname === 'poster') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for posters'));
      }
    } else {
      cb(null, true);
    }
  },
});

// --- Database setup ---
const dbFile = path.join(__dirname, 'movies.db');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      genres TEXT,
      year TEXT,
      featured INTEGER DEFAULT 0,
      thumbnail TEXT,
      video_path TEXT,
      poster_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
  
  // Add new columns if they don't exist (for existing databases)
  db.run('ALTER TABLE movies ADD COLUMN video_path TEXT', () => {});
  db.run('ALTER TABLE movies ADD COLUMN poster_path TEXT', () => {});

  // Seed sample movies if table is empty
  db.get('SELECT COUNT(*) as count FROM movies', (err, row) => {
    if (err) {
      console.error('Failed to count movies', err);
      return;
    }
    if (row.count === 0) {
      const insert = db.prepare(
        'INSERT INTO movies (title, description, genres, year, thumbnail, featured) VALUES (?, ?, ?, ?, ?, ?)'
      );
      insert.run(
        'The Pickup - VJ Junior',
        'Action-packed comedy where a risky job turns into the heist of a lifetime.',
        'Action, Comedy',
        '2025',
        '',
        1
      );
      insert.run(
        'Playdate',
        'A mysterious invitation leads to an unforgettable night.',
        'Thriller, Drama',
        '2024',
        '',
        0
      );
      insert.run(
        'Healer',
        'A gifted healer must choose between power and peace.',
        'Fantasy, Adventure',
        '2023',
        '',
        0
      );
      insert.finalize();
      console.log('Seeded sample movies into database');
    }
  });
});

// --- App config ---
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(uploadsDir)); // Serve uploaded files
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- API routes ---
// Get all movies
app.get('/api/movies', (req, res) => {
  db.all('SELECT * FROM movies ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create a new movie (with file uploads)
app.post('/api/movies', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]), (req, res) => {
  const { title, description, genres, year, thumbnail, featured } = req.body;
  if (!title || !description) {
    return res
      .status(400)
      .json({ error: 'Title and description are required.' });
  }

  // Get uploaded file paths
  const videoPath = req.files && req.files.video ? `/uploads/videos/${req.files.video[0].filename}` : null;
  const posterPath = req.files && req.files.poster ? `/uploads/posters/${req.files.poster[0].filename}` : null;

  db.serialize(() => {
    // If this movie should be featured, clear previous featured flags
    if (featured) {
      db.run('UPDATE movies SET featured = 0');
    }

    const stmt = db.prepare(
      'INSERT INTO movies (title, description, genres, year, thumbnail, featured, video_path, poster_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(
      title,
      description,
      genres || '',
      year || '',
      thumbnail || '',
      featured ? 1 : 0,
      videoPath || '',
      posterPath || '',
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Failed to save movie.' });
        }
        db.get(
          'SELECT * FROM movies WHERE id = ?',
          this.lastID,
          (err2, row) => {
            if (err2) {
              console.error(err2);
              return res.status(500).json({ error: 'Failed to load movie.' });
            }
            res.status(201).json(row);
          }
        );
      }
    );
  });
});

// Delete a movie
app.delete('/api/movies/:id', (req, res) => {
  const { id } = req.params;
  
  // First get the movie to delete associated files
  db.get('SELECT video_path, poster_path FROM movies WHERE id = ?', id, (err, movie) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to delete movie.' });
    }
    
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found.' });
    }
    
    // Delete associated files
    if (movie.video_path) {
      const videoFile = path.join(__dirname, movie.video_path);
      if (fs.existsSync(videoFile)) {
        fs.unlinkSync(videoFile);
      }
    }
    if (movie.poster_path) {
      const posterFile = path.join(__dirname, movie.poster_path);
      if (fs.existsSync(posterFile)) {
        fs.unlinkSync(posterFile);
      }
    }
    
    // Delete from database
    const stmt = db.prepare('DELETE FROM movies WHERE id = ?');
    stmt.run(id, function (err2) {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ error: 'Failed to delete movie.' });
      }
      res.json({ success: true });
    });
  });
});

// Mark a movie as featured
app.post('/api/movies/:id/feature', (req, res) => {
  const { id } = req.params;
  db.serialize(() => {
    db.run('UPDATE movies SET featured = 0');
    const stmt = db.prepare('UPDATE movies SET featured = 1 WHERE id = ?');
    stmt.run(id, function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to feature movie.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Movie not found.' });
      }
      res.json({ success: true });
    });
  });
});

// Fallback to index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Movie Soft running at http://localhost:${PORT}`);
});