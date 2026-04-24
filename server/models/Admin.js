const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');

const Admin = sequelize.define('Admin', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  role: {
    type: DataTypes.ENUM('super_admin', 'admin', 'support'),
    defaultValue: 'admin',
  },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  last_login_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'admins',
  hooks: {
    beforeCreate: async (admin) => {
      admin.password = await bcrypt.hash(admin.password, 12);
    },
    beforeUpdate: async (admin) => {
      if (admin.changed('password')) {
        admin.password = await bcrypt.hash(admin.password, 12);
      }
    },
  },
});

Admin.prototype.validatePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

module.exports = Admin;
