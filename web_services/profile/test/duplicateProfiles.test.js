const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const app = require('../app')

const profileA = {
    data: "Profile A Data",
    uuid: uuidv4(),
};

const channel = uuidv4();

describe('duplicate profiles', () => {

    beforeAll(async() =>{
        // upload profile A
        const res = await request(app)
        .post(`/upload/${channel}`)
        .send(profileA)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)
    })

    it('should handle duplicate profile upload to the same channel', async () => {
        // upload profile A again.
        let res = await request(app)
        .post(`/upload/${channel}`)
        .send(profileA)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)

        // Profile service should be idempotent, so there should still only be one "profile A" on the server
        const expectedResult = JSON.stringify({profileIds: [ profileA.uuid ]})
        res = await request(app)
        .get(`/list/${channel}`)
        .expect(200, expectedResult)
    })

    it('should handle duplicate profile upload to different channel', async () => {
        // upload profile A again, but to different channel.
        const otherChannel = uuidv4()
        let res = await request(app)
        .post(`/upload/${otherChannel}`)
        .send(profileA)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)

        // profileA should now be available in both channels
        const expectedResult = JSON.stringify({profileIds: [ profileA.uuid ]})
        res = await request(app).get(`/list/${channel}`)
        .expect(200, expectedResult)
        res = await request(app).get(`/list/${otherChannel}`)
        .expect(200, expectedResult)
    })

    it('should fail uploading existing profile with different content', async () => {
        // upload profile A again to the same channel, but with different data
        const profileA_modified = {
            data: "Different data than profile A",
            uuid: profileA.uuid,
        }
        let res = await request(app)
        .post(`/upload/${channel}`)
        .send(profileA_modified)
        .expect(500)
    })

})
