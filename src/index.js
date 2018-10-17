const { register, listen } = require('push-receiver');
const { ipcMain } = require('electron');
const Config = require('electron-config');
const {
  START_NOTIFICATION_SERVICE,
  NOTIFICATION_SERVICE_STARTED,
  NOTIFICATION_SERVICE_ERROR,
  NOTIFICATION_RECEIVED,
  TOKEN_UPDATED,
} = require('./constants');

const config = new Config();

const confPrefix = 'push-receiver-';

module.exports = {
  START_NOTIFICATION_SERVICE,
  NOTIFICATION_SERVICE_STARTED,
  NOTIFICATION_SERVICE_ERROR,
  NOTIFICATION_RECEIVED,
  TOKEN_UPDATED,
  setup,
};

// To be sure that start is called only once
let started = false;

// To be call from the main process
function setup(webContents) {
  // Will be called by the renderer process
  ipcMain.on(START_NOTIFICATION_SERVICE, async (_, senderId) => {
    // Retrieve saved credentials
    let credentials = config.get(confPrefix + 'credentials');
    // Retrieve saved senderId
    const savedSenderId = config.get(confPrefix + 'senderId');
    if (started) {
      webContents.send(NOTIFICATION_SERVICE_STARTED, (credentials.fcm || {}).token);
      return;
    }
    started = true;
    try {
      // Retrieve saved persistentId : avoid receiving all already received notifications on start
      const persistentIds = config.get(confPrefix + 'persistentIds') || [];
      // Register if no credentials or if senderId has changed
      if (!credentials || savedSenderId !== senderId) {
        credentials = await register(senderId);
        // Save credentials for later use
        config.set(confPrefix + 'credentials', credentials);
        // Save senderId
        config.set(confPrefix + 'senderId', senderId);
        // Notify the renderer process that the FCM token has changed
        webContents.send(TOKEN_UPDATED, credentials.fcm.token);
      }
      // Listen for GCM/FCM notifications
      await listen(Object.assign({}, credentials, { persistentIds }), onNotification(webContents));
      // Notify the renderer process that we are listening for notifications
      webContents.send(NOTIFICATION_SERVICE_STARTED, credentials.fcm.token);
    } catch (e) {
      console.error('PUSH_RECEIVER:::Error while starting the service', e);
      // Forward error to the renderer process
      webContents.send(NOTIFICATION_SERVICE_ERROR, e.message);
    }
  });
}

// Will be called on new notification
function onNotification(webContents) {
  return ({ notification, persistentId }) => {
    const persistentIds = config.get(confPrefix + 'persistentIds') || [];
    // Update persistentId
    config.set(confPrefix + 'persistentIds', [...persistentIds, persistentId]);
    // Notify the renderer process that a new notification has been received
    webContents.send(NOTIFICATION_RECEIVED, notification);
  };
}
