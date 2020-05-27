const request = require('supertest')
const app = require('../app')

describe('Heartbeat', () => {
    it('should respond to test request', async () => {
        const res = await request(app).get('/')
        expect(res.statusCode).toEqual(200)
        expect(res.text).toEqual("BrightID socket server")
    })
})
