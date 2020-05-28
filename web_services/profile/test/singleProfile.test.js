const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const app = require('../app')

const profileA = {
    data: "Profile A Data",
    uuid: uuidv4(),
};
const channel = uuidv4();

describe('Single profile', () => {

    it('should upload a single profile', async () => {
        const res = await request(app)
        .post(`/upload/${channel}`)
        .send(profileA)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)
    })

    it('should download a profile based on channel and uuid', async () => {
        const res = await request(app).get(`/download/${channel}/${profileA.uuid}`)
        .expect(200)
        expect(res.text).toEqual(JSON.stringify({data: profileA.data}))
    })

})
