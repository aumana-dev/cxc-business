const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const publicRoot = path.join(__dirname, '..');

app.use(express.static(publicRoot));
app.use('/cxc-gimnasios', express.static(publicRoot));

app.get('/cxc-gimnasios/*', (req, res) => {
  res.sendFile(path.join(publicRoot, 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicRoot, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
