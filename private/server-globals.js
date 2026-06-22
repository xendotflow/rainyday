// private/server-globals.js
module.exports = {
  broadcastUserList: null,
  broadcastBadgeUpdate: null,
  chatHistory: null,
  latestBadge: {}  // mapping: username -> latest badge URL (with cache-buster)
};
