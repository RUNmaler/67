// Simple online API - No setup needed
const data = {};

// READ - Get all data
function getAll() {
  return Object.values(data);
}

// READ - Get specific item
function getItem(id) {
  return data[id] || null;
}

// WRITE - Create/Save item
function saveItem(id, value) {
  data[id] = value;
  return { id, value, status: 'saved' };
}

// WRITE - Delete item
function deleteItem(id) {
  const deleted = data[id];
  delete data[id];
  return { id, deleted, status: 'deleted' };
}

// Export for use
module.exports = { getAll, getItem, saveItem, deleteItem };