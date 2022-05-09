const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const sizeof = require('object-sizeof')
const app = require('../app')
const config = require('../config')

const channelId = uuidv4();

describe('size-based channel limit', () => {
    let channelEntries = [];

    it(`should allow entries up to ${config.channel_max_size_bytes} Bytes`, async () => {
        // completely fill channel with random entries
        let size=0;
        let remainingSize = config.channel_max_size_bytes
        let i =0;
        while (true) {
            let entry = {
                data: `Profile ${i} data`,
                uuid: uuidv4(),
            }
            const entrySize = sizeof(entry.data) + sizeof(entry.uuid)
            if (entrySize < remainingSize) {
                channelEntries.push(entry)
                const res = await request(app)
                .post(`/upload/${channelId}`)
                .send(channelEntries[i])
                .expect(201)
                remainingSize -= entrySize
                size += entrySize
                console.log(`New size: ${size}, remaining: ${remainingSize}`)
                i++;
            } else {
                break
            }
        }
        // double-check channel list returns correct size
        const res = await request(app)
        .get(`/list/${channelId}`)
        .expect(200)
        expect(res.body.profileIds).toHaveLength(i);
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

    it('should successfully upload another entry after removing one', async () => {
        // delete the first entry
        await request(app)
        .delete(`/${channelId}/${channelEntries[0].uuid}`)
        .expect(200)
        // upload new entry
        let entry = {
            data: `Profile X data`,
            uuid: uuidv4(),
        }
        const res = await request(app)
        .post(`/upload/${channelId}`)
        .send(entry)
        .expect(201)
    })

})
