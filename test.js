'use strict'

const test = require('tape')
const createHafas = require('vbb-hafas')
const createServer = require('.')

const hafas = createHafas('hafas-monitor-trips-server test')

const someArea = {
	north: 52.51, south: 52.4, west: 13.35, east: 13.38
}
const someAreaWithin = {
	north: 52.505, south: 52.45, west: 13.355, east: 13.375
}

test('overlapping bounding boxes share an event emitter', (t) => {
	const server = createServer(hafas)

	const subA = server.subscribe(someArea)
	subA.on('stopover', () => {})
	const subB = server.subscribe(someAreaWithin)
	subA.on('stopover', () => {})

	t.equal(server.index.all().length, 1)

	subA.destroy()
	subB.destroy()
})
