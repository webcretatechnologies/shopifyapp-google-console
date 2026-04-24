require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sequelize } = require('../models');

async function migrate() {
  await sequelize.authenticate();
  console.log('Database connected');
  await sequelize.sync({ alter: true });
  console.log('All tables created/updated');
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });
