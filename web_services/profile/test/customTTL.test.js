const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const app = require('../app')
const config = require('../config')
const {channel_config, channel_ttl_header, TTLExtension} = require('../config')

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
        expect(res.header).toHaveProperty(channel_ttl_header)

        // channel should now list the expected profile
        res = await request(app)
        .get(`/list/${channel}`)
        .expect(200)
        expect(res.header).toHaveProperty(channel_ttl_header)
        let expectedResult = JSON.stringify({profileIds: [ profile.uuid ]})
        expect(res.text).toEqual(expectedResult)

        // wait till TTL expired
        const msToExpiration = (requestedTtl + channel_config.checkperiod + 5 ) * 1000
        await new Promise((r) => setTimeout(r, msToExpiration));

        // channel list should now result in 404
        res = await request(app)
        .get(`/list/${channel}`)
        .expect(404)
        expect(res.body).toHaveProperty('error', `channelId ${channel} not found`)
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
        expect(res.header).toHaveProperty(channel_ttl_header)
        expect(parseInt(res.header[channel_ttl_header])).toBeLessThanOrEqual(profile.requestedTtl)

        // channel should now list the expected profile
        res = await request(app)
        .get(`/list/${channel}`)
        .expect(200)
        expect(res.header).toHaveProperty(channel_ttl_header)
        expect(parseInt(res.header[channel_ttl_header])).toBeLessThanOrEqual(profile.requestedTtl)
        let expectedResult = JSON.stringify({profileIds: [ profile.uuid ]})
        expect(res.text).toEqual(expectedResult)
    })
})

describe('Custom TTL header', () => {
    const data = {
        data: "Some data",
        uuid: uuidv4(),
        requestedTtl: 120 // 2 minutes
    };

    it('should provide x-ttl header when creating a channel', async () => {
        // create channel by uploading profile
        const channel = uuidv4();
        let res = await request(app)
        .post(`/upload/${channel}`)
        .send(data)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)
        expect(res.header).toHaveProperty(channel_ttl_header)
        expect(parseInt(res.header[channel_ttl_header])).toBeLessThanOrEqual(data.requestedTtl)
    });

    describe('should provide x-ttl header', () => {
        const channel = uuidv4();

        beforeAll(async () => {
            // create channel by uploading profile
            const res = await request(app)
            .post(`/upload/${channel}`)
            .send(data)
            .expect(201)
            expect(res.body).toHaveProperty('success', true)
        })

        it('when listing a channel', async () => {
            const res = await request(app)
            .get(`/list/${channel}`)
            .expect(200)
            expect(res.header).toHaveProperty(channel_ttl_header)
            const returnedTTL = parseInt(res.header[channel_ttl_header])
            expect(returnedTTL).toBeLessThanOrEqual(data.requestedTtl)
            expect(returnedTTL).toBeGreaterThan(data.requestedTtl - 5)
        });

        it('when downloading an entry', async () => {
            const res = await request(app)
            .get(`/download/${channel}/${data.uuid}`)
            .expect(200)
            expect(res.header).toHaveProperty(channel_ttl_header)
            const returnedTTL = parseInt(res.header[channel_ttl_header])
            expect(returnedTTL).toBeLessThanOrEqual(data.requestedTtl)
            expect(returnedTTL).toBeGreaterThan(data.requestedTtl - 5)
        });
    })

})

describe('TTL extension', () => {
    it('should extend channel TTL when uploading data', async() => {
        // create channel with min TTL
        const requestedTtl = config.minTTL
        const data = {
            data: "Profile A Data",
            uuid: uuidv4(),
            requestedTtl
        };
        const channel = uuidv4();
        let res = await request(app)
        .post(`/upload/${channel}`)
        .send(data)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)
        expect(res.header).toHaveProperty(channel_ttl_header)
        expect(parseInt(res.header[channel_ttl_header])).toBeLessThanOrEqual(data.requestedTtl)

        // upload additional data
        const moreData = {
            data: "More Data",
            uuid: uuidv4(),
        };
        res = await request(app)
        .post(`/upload/${channel}`)
        .send(moreData)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)

        // channel TTL should now be extended
        expect(res.header).toHaveProperty(channel_ttl_header)
        let newTTL = parseInt(res.header[channel_ttl_header])
        expect(newTTL).toBeGreaterThan(data.requestedTtl)
        expect(newTTL).toBeLessThanOrEqual(TTLExtension)

        // wait 2 seconds so TTL is below threshhold
        await new Promise((r) => setTimeout(r, 2000));

        // list channel to check new TTL
        res = await request(app)
        .get(`/list/${channel}`)
        .expect(200)
        expect(res.header).toHaveProperty(channel_ttl_header)
        newTTL = parseInt(res.header[channel_ttl_header])
        expect(newTTL).toBeLessThan(TTLExtension)

        // upload additional data
        const muchMoreData = {
            data: "Much more Data",
            uuid: uuidv4(),
        };
        res = await request(app)
        .post(`/upload/${channel}`)
        .send(muchMoreData)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)

        // channel TTL should now be extended again
        expect(res.header).toHaveProperty(channel_ttl_header)
        let prevTTL = newTTL
        newTTL = parseInt(res.header[channel_ttl_header])
        expect(newTTL).toBeGreaterThan(prevTTL)
        expect(newTTL).toBeLessThanOrEqual(TTLExtension)

    })
})
