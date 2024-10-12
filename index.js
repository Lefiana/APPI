const express = require('express');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getDatabase } = require('firebase-admin/database');
const serviceAccount = require('./serviceAccountKey.json');

const app = express();

// Use CORS middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK with Firestore and Realtime Database
initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://to-do-list-8d7c1-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = getFirestore();
const rtdb = getDatabase();  // Firebase Realtime Database

// ----------------- TASK API (Firestore) -----------------

// Create a task (POST /to-do-list)
app.post('/to-do-list', async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).send({ message: 'Title and description are required' });
    }

    const task = {
      title,
      description,
      status: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db.collection('tasks').add(task);
    console.log(task);
    res.status(201).send({ message: 'Task added successfully', id: docRef.id });
  } catch (error) {
    res.status(500).send({ message: 'Server error', error });
  }
});

// Edit a task (PUT /todo/:id)
app.put('/todo/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status } = req.body;

    if (!title || !description) {
      return res.status(400).send({ message: 'Title and description are required' });
    }

    const taskRef = db.collection('tasks').doc(id);
    const updatedTask = {
      title,
      description,
      status: status || false,
      updatedAt: new Date(),
    };

    await taskRef.update(updatedTask);
    res.status(200).send({ message: 'Task updated successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Server error', error });
  }
});

// Get list of tasks (GET /list)
app.get('/list', async (req, res) => {
  try {
    const { sortBy, order = 'desc', search } = req.query;

    let query = db.collection('tasks');

    // If a search term is provided, filter tasks by title and description
    if (search) {
      query = query.where('title', '>=', search).where('title', '<=', search + '\uf8ff');
    }

    const tasksSnapshot = await query.get();
    if (tasksSnapshot.empty) {
      return res.status(404).send({ message: 'No tasks found' });
    }

    let tasks = [];
    tasksSnapshot.forEach(doc => {
      const task = { id: doc.id, ...doc.data() };
      if (!search || task.title.toLowerCase().includes(search.toLowerCase()) || task.description.toLowerCase().includes(search.toLowerCase())) {
        tasks.push(task);
      }
    });

    if (sortBy === 'timestamp') {
      tasks = tasks.sort((a, b) => {
        const dateA = a.createdAt.toDate();
        const dateB = b.createdAt.toDate();
        return order === 'asc' ? dateA - dateB : dateB - dateA;
      });
    } else if (sortBy === 'status') {
      tasks = tasks.sort((a, b) => {
        if (a.status === b.status) return 0;
        return order === 'asc' ? a.status - b.status : b.status - a.status;
      });
    }

    res.status(200).send({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).send({ message: 'Server error', error });
  }
});

// Delete a task (DELETE /list/:id)
app.delete('/list/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.collection('tasks').doc(id).delete();

    res.status(200).send({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Server error', error });
  }
});

// ----------------- CHAT API (Realtime Database) -----------------

// POST a new chat message (POST /chat)
app.post('/chat', async (req, res) => {
  try {
    const { username, message } = req.body;

    if (!username || !message) {
      return res.status(400).send({ message: 'Username and message are required' });
    }

    const chatRef = rtdb.ref('chats').push();  // Add a new chat message
    const newMessage = {
      username,
      message,
      timestamp: Date.now(),
    };

    await chatRef.set(newMessage);  // Save the message to Realtime Database
    res.status(201).send({ message: 'Message sent successfully', id: chatRef.key });
  } catch (error) {
    console.error('Error posting message:', error);
    res.status(500).send({ message: 'Server error', error });
  }
});

// GET chat messages (GET /chats)
app.get('/chats', async (req, res) => {
  try {
    const chatsRef = rtdb.ref('chats');
    const snapshot = await chatsRef.orderByChild('timestamp').once('value');  // Retrieve chats ordered by timestamp

    if (!snapshot.exists()) {
      return res.status(404).send({ message: 'No chat messages found' });
    }

    const messages = [];
    snapshot.forEach((childSnapshot) => {
      messages.push({ id: childSnapshot.key, ...childSnapshot.val() });
    });

    res.status(200).send({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).send({ message: 'Server error', error });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
