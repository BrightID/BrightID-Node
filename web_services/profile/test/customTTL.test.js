const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const app = require('../app')
const config = require('../config')
const {channel_config, channel_ttl_header, TTLExtension, channel_expires_header} = require('../config')

jest.setTimeout(120000);

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
        expect(res.header).toHaveProperty(channel_expires_header)

        // channel should now list the expected profile
        res = await request(app)
        .get(`/list/${channel}`)
        .expect(200)
        expect(res.header).toHaveProperty(channel_expires_header)
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
        const expires = Math.floor((Date.now()/1000 + profile.requestedTtl))
        const channel = uuidv4();
        let res = await request(app)
        .post(`/upload/${channel}`)
        .send(profile)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)
        expect(res.header).toHaveProperty(channel_expires_header)
        expect(parseInt(res.header[channel_expires_header])).toEqual(expires)

        // channel should now list the expected profile
        res = await request(app)
        .get(`/list/${channel}`)
        .expect(200)
        expect(res.header).toHaveProperty(channel_expires_header)
        expect(parseInt(res.header[channel_expires_header])).toEqual(expires)
        let expectedResult = JSON.stringify({profileIds: [ profile.uuid ]})
        expect(res.text).toEqual(expectedResult)
    })
})

describe('Custom expires header', () => {
    const data = {
        data: "Some data",
        uuid: uuidv4(),
        requestedTtl: 120 // 2 minutes
    };

    it('should provide x-expires header when creating a channel', async () => {
        // create channel by uploading profile
        const channel = uuidv4();
        let res = await request(app)
        .post(`/upload/${channel}`)
        .send(data)
        .expect(201)
        const expires = Math.floor((Date.now()/1000 + data.requestedTtl))
        expect(res.body).toHaveProperty('success', true)
        expect(res.header).toHaveProperty(channel_expires_header)
        expect(parseInt(res.header[channel_expires_header])).toEqual(expires)
    });

    describe('should provide x-expires header', () => {
        const channel = uuidv4();
        let expires

        beforeAll(async () => {
            // create channel by uploading profile
            const res = await request(app)
            .post(`/upload/${channel}`)
            .send(data)
            .expect(201)
            expect(res.body).toHaveProperty('success', true)
            expires = Math.floor((Date.now()/1000 + data.requestedTtl))
        })

        it('when listing a channel', async () => {
            const res = await request(app)
            .get(`/list/${channel}`)
            .expect(200)
            expect(res.header).toHaveProperty(channel_expires_header)
            const returnedExpires = parseInt(res.header[channel_expires_header])
            expect(returnedExpires).toEqual(expires)
        });

        it('when downloading an entry', async () => {
            const res = await request(app)
            .get(`/download/${channel}/${data.uuid}`)
            .expect(200)
            expect(res.header).toHaveProperty(channel_expires_header)
            const returnedExpires = parseInt(res.header[channel_expires_header])
            expect(returnedExpires).toEqual(expires)
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
        const expires = Math.floor((Date.now()/1000 + data.requestedTtl))
        const channel = uuidv4();

        let res = await request(app)
        .post(`/upload/${channel}`)
        .send(data)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)
        expect(res.header).toHaveProperty(channel_expires_header)
        expect(parseInt(res.header[channel_expires_header])).toEqual(expires)

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
        expect(res.header).toHaveProperty(channel_expires_header)
        let newExpires = parseInt(res.header[channel_expires_header])
        expect(newExpires).toBeGreaterThan(expires)
        expect(newExpires).toBeLessThanOrEqual(expires + TTLExtension)

        // wait 2 seconds so TTL is below extension threshhold again
        await new Promise((r) => setTimeout(r, 2000));

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
        expect(res.header).toHaveProperty(channel_expires_header)
        let prevExpires = newExpires
        newExpires = parseInt(res.header[channel_expires_header])
        expect(newExpires).toBeGreaterThan(prevExpires)
        expect(newExpires).toBeLessThanOrEqual(prevExpires + TTLExtension)

    })
})
