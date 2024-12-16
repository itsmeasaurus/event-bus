const state = {
    listeners: new Map(),
    eventHistory: new Map(),
    maxHistorySize: 100,
    debug: false,
    eventQueue: [],
    isProcessing: false,
    middlewares: [],
    errorHandlers: new Set(),
    wildcardSubscriptions: new Map(),
    retryConfig: {
        maxRetries: 3,
        retryDelay: 1000,
    }
}

const EventBus = {
    subscribe: async function(event, callback, options = {}) {
        try {
            if (!event || typeof callback !== 'function') {
                throw new Error('Invalid event or callback')
            }

            const defaultOptions = {
                once: false,
                priority: 0,
                async: false,
                pattern: false,
                timeout: 0,
                retry: false,
                context: null,
            }

            const eventListeners = state.listeners.get(event) || new Set()
            const listener = {
                callback,
                options: { ...defaultOptions, ...options }
            }

            if (options.pattern) {
                state.wildcardSubscriptions.set(event, eventListeners)
            } else {
                state.listeners.set(event, eventListeners)
            }
            eventListeners.add(listener)

            this._log(`Subscribed to event: ${event}`)

            return () => this.unsubscribe(event, callback)
        } catch (error) {
            this._handleError(error)
            throw error
        }
    },

    once: async function(event, callback) {
        return this.subscribe(event, callback, { once: true })
    },

    unsubscribe: async function(event, callback) {
        try {
            const eventListeners = state.listeners.get(event)
            if (!eventListeners) return

            if (callback) {
                eventListeners.forEach(listener => {
                    if (listener.callback === callback) {
                        eventListeners.delete(listener)
                    }
                })
            } else {
                state.listeners.delete(event)
            }

            this._log(`Unsubscribed from event: ${event}`)
        } catch (error) {
            reportError(error)
            throw error
        }
    },

    emit: async function(event, data = null, options = {}) {
        try {
            this._log(`Emitting event: ${event}`, data)
            
            let modifiedData = await this._applyMiddlewares(event, data)
            
            this._addToHistory(event, modifiedData)

            return new Promise((resolve, reject) => {
                state.eventQueue.push({
                    event,
                    data: modifiedData,
                    options,
                    resolve,
                    reject,
                    timestamp: Date.now()
                })
                this._processQueue()
            })
        } catch (error) {
            this._handleError(error)
            throw error
        }
    },

    _processQueue: async function() {
        if (state.isProcessing) return

        state.isProcessing = true
        while (state.eventQueue.length > 0) {
            const { event, data, resolve, reject } = state.eventQueue.shift()
            try {
                const results = await this._processEvent(event, data)
                resolve(results)
            } catch (error) {
                reject(error)
            }
        }
        state.isProcessing = false
    },

    _processEvent: async function(event, data, options = {}) {
        const eventListeners = state.listeners.get(event)
        const wildcardListeners = this._getMatchingWildcardListeners(event)
        const allListeners = new Set([...(eventListeners || []), ...wildcardListeners])

        if (!allListeners.size) return []

        const results = []
        const promises = []

        const sortedListeners = Array.from(allListeners)
            .sort((a, b) => b.options.priority - a.options.priority)

        for (const listener of sortedListeners) {
            try {
                const executeListener = async () => {
                    const startTime = Date.now()
                    const result = await this._executeWithTimeout(
                        listener.callback.bind(listener.options.context || null),
                        data,
                        listener.options.timeout
                    )
                    const processingTime = Date.now() - startTime
                    return { result, processingTime }
                }

                if (listener.options.retry) {
                    promises.push(this._executeWithRetry(executeListener))
                } else if (listener.options.async) {
                    promises.push(executeListener())
                } else {
                    const { result } = await executeListener()
                    results.push(result)
                }

                if (listener.options.once) {
                    allListeners.delete(listener)
                }
            } catch (error) {
                this._handleError(error)
            }
        }

        if (promises.length > 0) {
            const asyncResults = await Promise.allSettled(promises)
            results.push(...asyncResults.map(r => 
                r.status === 'fulfilled' ? r.value.result : r.reason
            ))
        }

        return results
    },

    _executeWithTimeout: async function(fn, data, timeout) {
        if (!timeout) return fn(data)

        return Promise.race([
            fn(data),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Execution timeout')), timeout)
            )
        ])
    },

    _executeWithRetry: async function(fn) {
        let attempts = 0
        while (attempts < state.retryConfig.maxRetries) {
            try {
                return await fn()
            } catch (error) {
                attempts++
                if (attempts === state.retryConfig.maxRetries) throw error
                await new Promise(resolve => 
                    setTimeout(resolve, state.retryConfig.retryDelay * attempts)
                )
            }
        }
    },

    _getMatchingWildcardListeners: function(event) {
        const matches = new Set()
        for (const [pattern, listeners] of state.wildcardSubscriptions) {
            if (this._matchesPattern(event, pattern)) {
                listeners.forEach(listener => matches.add(listener))
            }
        }
        return matches
    },

    _matchesPattern: function(event, pattern) {
        const eventParts = event.split('.')
        const patternParts = pattern.split('.')
        
        if (patternParts.length !== eventParts.length) return false
        
        return patternParts.every((part, i) => 
            part === '*' || part === eventParts[i]
        )
    },

    _applyMiddlewares: async function(event, data) {
        let modifiedData = data
        for (const middleware of state.middlewares) {
            modifiedData = await middleware(event, modifiedData)
        }
        return modifiedData
    },

    _handleError: function(error) {
        state.errorHandlers.forEach(handler => handler(error))
        if (state.debug) {
            console.error('[EventBus Error]', error)
        }
    },

    getHistory: async function(event = null) {
        if (event) {
            return state.eventHistory.get(event) || []
        }
        return Array.from(state.eventHistory.entries())
    },

    clearHistory: async function(event = null) {
        if (event) {
            state.eventHistory.delete(event)
        } else {
            state.eventHistory.clear()
        }
    },

    _addToHistory: function(event, data) {
        const eventLog = state.eventHistory.get(event) || []
        eventLog.unshift({
            timestamp: new Date(),
            data
        })

        if (eventLog.length > state.maxHistorySize) {
            eventLog.pop()
        }

        state.eventHistory.set(event, eventLog)
    },

    setDebug: function(enabled) {
        state.debug = enabled
    },

    _log: function(...args) {
        if (state.debug) {
            console.log('[EventBus]', ...args)
        }
    },

    getEvents: function() {
        return Array.from(state.listeners.keys())
    },

    hasListeners: function(event) {
        const eventListeners = state.listeners.get(event)
        return eventListeners ? eventListeners.size > 0 : false
    },

    removeAllListeners: async function() {
        state.listeners.clear()
        this._log('All listeners removed')
    },

    use: function(middleware) {
        if (typeof middleware !== 'function') {
            throw new Error('Middleware must be a function')
        }
        state.middlewares.push(middleware)
    },

    onError: function(handler) {
        if (typeof handler !== 'function') {
            throw new Error('Error handler must be a function')
        }
        state.errorHandlers.add(handler)
    },

    setRetryConfig: function(config) {
        state.retryConfig = { ...state.retryConfig, ...config }
    },

    getEventStats: async function(event) {
        const history = await this.getHistory(event)
        return {
            totalEmissions: history.length,
            lastEmitted: history[0]?.timestamp,
            listenerCount: this.getListenerCount(event),
            averageProcessingTime: this._calculateAverageProcessingTime(history)
        }
    },

    getListenerCount: function(event) {
        const eventListeners = state.listeners.get(event)
        return eventListeners ? eventListeners.size : 0
    },

    waitFor: async function(event, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timer = timeout ? setTimeout(() => {
                reject(new Error(`Timeout waiting for event: ${event}`))
            }, timeout) : null

            this.once(event, (data) => {
                if (timer) clearTimeout(timer)
                resolve(data)
            })
        })
    },

    emitLater: async function(event, data, delay) {
        await new Promise(resolve => setTimeout(resolve, delay))
        return this.emit(event, data)
    },

    _calculateAverageProcessingTime: function(history) {
        if (!history.length) return 0
        const times = history.map(h => h.processingTime || 0)
        return times.reduce((a, b) => a + b, 0) / times.length
    }
}

Object.freeze(EventBus)

export default EventBus 