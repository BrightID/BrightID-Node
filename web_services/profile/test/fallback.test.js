const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const app = require('../app')

const profileA = {
    data: "Profile A Data",
    uuid: uuidv4(),
};

describe('backwards compatibility', () => {

    it('should upload a profile without channel', async () => {
        const res = await request(app)
        .post('/upload')
        .send(profileA)
        .expect(200)
        expect(res.body).toHaveProperty('success', true)
    })

    it('should download a profile without channel', async () => {
        const res = await request(app).get(`/download/${profileA.uuid}`)
        .expect(200)
        expect(res.text).toEqual(JSON.stringify({data: profileA.data}))
    })

})
