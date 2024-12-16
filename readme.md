# 🚌 EventBus

A basic, flexible JavaScript event management code with features for event handling, middleware support, and robust error management.

## 🌟 Features

- **Flexible Event Subscription**: Subscribe to specific events with various options
- **Middleware Support**: Modify event data before processing
- **Error Handling**: Centralized error management
- **Event History**: Track and retrieve event logs
- **Wildcard Event Matching**: Subscribe to events using pattern matching
- **Async/Sync Event Processing**: Support for both synchronous and asynchronous event listeners
- **Retry Mechanism**: Configurable retry for event listeners
- **Timeout Management**: Set timeouts for event listeners
- **Debugging Support**: Enable detailed logging

## 🚀 Quick Start

```javascript

// Subscribe to an event
EventBus.subscribe('user.login', (userData) => {
  console.log('User logged in:', userData);
});

// Emit an event
EventBus.emit('user.login', { username: 'johndoe' });
```

### Subscription Methods

#### `subscribe(event, callback, options)`
Subscribe to an event with optional configuration.

**Options:**
- `once`: Listener will be removed after first execution
- `priority`: Listener execution priority
- `async`: Run listener asynchronously
- `pattern`: Enable wildcard matching
- `timeout`: Set execution timeout
- `retry`: Enable retry mechanism
- `context`: Set callback execution context

```javascript
EventBus.subscribe('user.*', handler, { 
  priority: 10, 
  pattern: true 
});
```

#### `once(event, callback)`
Subscribe to an event that triggers only once.

#### `unsubscribe(event, callback)`
Remove a specific event listener.

### Event Emission

#### `emit(event, data, options)`
Emit an event with optional data.

#### `waitFor(event, timeout)`
Wait for a specific event with optional timeout.

#### `emitLater(event, data, delay)`
Delay event emission.

### Middleware & Error Handling

#### `use(middleware)`
Add a middleware function to transform event data.

```javascript
EventBus.use(async (event, data) => {
  // Modify or validate data before event processing
  return modifiedData;
});
```

#### `onError(handler)`
Register a global error handler.

### Configuration

#### `setDebug(enabled)`
Enable or disable debug logging.

#### `setRetryConfig(config)`
Configure retry mechanism.

### Utility Methods

- `getHistory(event)`: Retrieve event history
- `clearHistory(event)`: Clear event logs
- `getEvents()`: List all registered events
- `hasListeners(event)`: Check for event listeners
- `removeAllListeners()`: Remove all event listeners
- `getEventStats(event)`: Get event emission statistics

## 🛡️ Error Handling

EventBus provides comprehensive error management:
- Global error handlers
- Configurable retry mechanisms
- Timeout management
- Optional debug logging
