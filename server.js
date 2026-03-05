const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const projectRoutes = require('./routes/projects');
const adminRoutes = require('./routes/admin');

app.use('/api/projects', projectRoutes);
app.use('/api/admin', adminRoutes);

app.listen(PORT, () => {
  console.log(`ProDash running at http://localhost:${PORT}`);
});
