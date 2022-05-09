const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const app = require('../app')
const config = require('../config')
const {channel_config} = require('../config')

jest.setTimeout(90000);

describe('Different TTL values', () => {

    it('should fail to create channel with excessive TTL', async () => {
        const requestedTtl = config.maxTTL + 100
        const profile = {
            data: "Profile A Data",
            uuid: uuidv4(),
            requestedTtl
        };
        const channel = uuidv4();
        const res = await request(app)
        .post(`/upload/${channel}`)
        .send(profile)
        .expect(400)
        expect(res.body).toHaveProperty('error', `requested TTL ${requestedTtl} too high`)
    })

    it('should fail to create channel with too low TTL', async () => {
        const requestedTtl = config.minTTL - 10
        const profile = {
            data: "Profile A Data",
            uuid: uuidv4(),
            requestedTtl
        };
        const channel = uuidv4();
        const res = await request(app)
        .post(`/upload/${channel}`)
        .send(profile)
        .expect(400)
        expect(res.body).toHaveProperty('error', `requested TTL ${requestedTtl} too low`)
    })

    it('should create a channel with min TTL', async () => {
        // create channel and upload profile
        const requestedTtl = config.minTTL
        const profile = {
            data: "Profile A Data",
            uuid: uuidv4(),
            requestedTtl
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
        const msToExpiration = (requestedTtl + channel_config.checkperiod + 5 ) * 1000
        await new Promise((r) => setTimeout(r, msToExpiration));

        // channel list should now be empty
        res = await request(app)
        .get(`/list/${channel}`)
        .expect(200)
        expectedResult = JSON.stringify({profileIds: []})
        expect(res.text).toEqual(expectedResult)
    })

    it('should create a channel with max TTL', async () => {
        // create channel and upload profile
        const profile = {
            data: "Profile A Data",
            uuid: uuidv4(),
            requestedTtl: config.maxTTL
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
    })
})
