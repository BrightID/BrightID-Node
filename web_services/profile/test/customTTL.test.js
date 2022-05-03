const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const app = require('../app')
const config = require('../config')

jest.setTimeout(30000);

describe('Different TTL values', () => {

    it('should fail to create channel with excessive TTL', async () => {
        const profile = {
            data: "Profile A Data",
            uuid: uuidv4(),
            requestedTtl: config.stdTTL + 100
        };
        const channel = uuidv4();
        const res = await request(app)
        .post(`/upload/${channel}`)
        .send(profile)
        .expect(400)
        expect(res.body).toHaveProperty('error', 'requested TTL too high')
    })

    it('should create a channel with 10 seconds TTL', async () => {
        // create channel and upload profile
        const profile = {
            data: "Profile A Data",
            uuid: uuidv4(),
            requestedTtl: 10
        };
        const channel = uuidv4();
        let res = await request(app)
        .post(`/upload/${channel}`)
        .send(profile)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)

        // channel should now list the expected profile
        res = await request(app)
        .get(`/list/${channel}`)
        .expect(200)
        let expectedResult = JSON.stringify({profileIds: [ profile.uuid ]})
        expect(res.text).toEqual(expectedResult)

        // wait till TTL expired
        await new Promise((r) => setTimeout(r, 12000 ));

        // channel list should now be empty
        res = await request(app)
        .get(`/list/${channel}`)
        .expect(200)
        expectedResult = JSON.stringify({profileIds: []})
        expect(res.text).toEqual(expectedResult)
    })

})
