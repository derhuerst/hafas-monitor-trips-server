'use strict'

const {EventEmitter} = require('events')
const RBush = require('rbush')
const createMonitor = require('hafas-monitor-trips')
const debug = require('debug')('hafas-monitor-trips-server')

const refCount = Symbol('ref count')
const monitorProxy = (monitor, bbox, destroyMonitor) => {
	const isWithinBbox = (loc) => (
		loc.latitude <= bbox.north &&
		loc.latitude >= bbox.south &&
		loc.longitude <= bbox.east &&
		loc.longitude <= bbox.west
	)
	const stopoverFilter = (st) => (
		st.stop &&
		st.stop.location &&
		isWithinBbox(st.stop.location)
	)
	const events = {
		'trip': t => t.stopovers.some(stopoverFilter),
		'new-trip': (_, m) => (
			isWithinBbox(m.location) ||
			m.nextStopovers.some(stopoverFilter)
		),
		'trip-obsolete': (_, t) => t => t.stopovers.some(stopoverFilter),
		'stopover': stopoverFilter,
		'position': isWithinBbox,
		'error': err => true,
		'stats': stats => true
	}

	const proxy = new EventEmitter()
	const listeners = Object.entries(events).map(([eventName, filter]) => [
		eventName,
		(...args) => {
			if (filter(...args)) proxy.emit(eventName, ...args)
		}
	])

	for (const [eventName, listener] of listeners) {
		monitor.on(eventName, listener)
	}

	if (!(refCount in monitor)) monitor[refCount] = 1
	else monitor[refCount]++

	proxy.destroy = () => {
		if (!monitor) return;

		for (const [eventName, listener] of listeners) {
			monitor.removeListener(eventName, listener)
		}

		monitor[refCount]--
		if (monitor[refCount] <= 0) destroyMonitor()
		monitor = null
	}

	return proxy
}

const createServer = (hafas) => {
	const index = new RBush()
	let nrOfMonitors = 0

	const subscribe = (bbox) => { // todo: filter fn
		const idxBbox = {
			minX: bbox.west,
			minY: bbox.south,
			maxX: bbox.east,
			maxY: bbox.north
		}

		// find existing monitor or create new
		let entry = index.search(idxBbox).find(existing => (
			existing.minX <= idxBbox.minX &&
			existing.minY <= idxBbox.minY &&
			existing.maxX >= idxBbox.maxX &&
			existing.maxY >= idxBbox.maxY
		))
		if (!entry) {
			debug('creating new monitor for', bbox)
			entry = {
				...idxBbox,
				monitor: createMonitor(hafas, bbox)
			}
			index.insert(entry)
			nrOfMonitors++
		} else debug('reusing existing monitor for', bbox)

		const removeMonitor = () => {
			debug('removing monitor for', bbox)
			index.remove(entry)
			nrOfMonitors--
		}
		return monitorProxy(entry.monitor, bbox, removeMonitor)
	}

	return {
		subscribe,
		nrOfMonitors: () => nrOfMonitors
	}
}

module.exports = createServer
