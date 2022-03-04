const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const app = require('../app')
const config = require('../config')

const channelId = uuidv4();

describe('Standard channel limit', () => {

    let channelEntries = [];

    it(`should allow max number of entries`, async () => {
        // completely fill channel with random entries
        for (i = 0; i < config.channel_entry_limit; i++) {
            channelEntries.push({
                data: `Profile ${i} data`,
                uuid: uuidv4(),
            })
            const res = await request(app)
            .post(`/upload/${channelId}`)
            .send(channelEntries[i])
            .expect(201)
        }
        // double-check channel list returns correct size
        const res = await request(app)
        .get(`/list/${channelId}`)
        .expect(200)
        expect(res.body.profileIds).toHaveLength(config.channel_entry_limit);
    })

    it(`should fail when uploading additional entries`, async() => {
        const res = await request(app)
        .post(`/upload/${channelId}`)
        .send({
            data: `Another profile data`,
            uuid: uuidv4(),
        })
        .expect(config.channel_limit_response_code)
        expect(res.body).toHaveProperty('error', config.channel_limit_message)
    })

    it(`should not fail when uploading additional entries starting with "sig_", "connection_" and "group_" to recovery channels`, async() => {
        await request(app)
        .post(`/upload/${channelId}`)
        .send({
            data: `Another profile data`,
            uuid: 'sig_' + uuidv4(),
        })
        .expect(201)
        // double-check channel list returns correct size
        const res = await request(app)
        .get(`/list/${channelId}`)
        .expect(200)
        expect(res.body.profileIds).toHaveLength(config.channel_entry_limit + 1);
    })
})
