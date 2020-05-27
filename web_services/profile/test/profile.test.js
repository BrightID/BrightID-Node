const request = require('supertest')
const app = require('../app')

describe('Profile', () => {

    const testProfile = {
        data: "Random Profile Data",
        uuid: "Random Profile UUID"
    }

    it('should upload a single profile', async () => {
        const res = await request(app)
        .post('/upload')
        .send(testProfile)
        expect(201)
        expect(res.body).toHaveProperty('success', true)
    })

    it('should download a profile based on uuid', async () => {
        const res = await request(app).get(`/download/${testProfile.uuid}`)
        expect(res.statusCode).toEqual(200)
        expect(res.text).toEqual(JSON.stringify({data: testProfile.data}))
    })

})
