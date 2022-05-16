const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const app = require('../app')

const setupChannel = async (numEntries) => {
    channelId = uuidv4();
    channelEntries = [];
    // prepare data in channel
    for (let i = 0; i < numEntries; i++) {
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
    expect(res.body.profileIds).toHaveLength(numEntries);

    return {channelId, channelEntries}
}

describe('Remove items from channel', () => {

    let channelId
    let channelEntries;
    const numEntries = 3;

    describe('Delete invalid entries', () => {
        // Setup random channel
        beforeAll(async ()=>{
            const channelData = await setupChannel(numEntries)
            channelId = channelData.channelId
            channelEntries = channelData.channelEntries
        })

        it(`should handle deleting entries in non-existing channel`, async () => {
            const invalidChannelId = uuidv4();
            const deleteResult = await request(app)
            .delete(`/${invalidChannelId}/${channelEntries[0].uuid}`)
            .expect(404)
        })

        it(`should handle deleting non-existing entry`, async () => {
            const invalidEntryId = uuidv4();
            const deleteResult = await request(app)
            .delete(`/${channelId}/${invalidEntryId}`)
            .expect(404)
        })
    })

    describe('Repeated deletion of same entry', () => {
        // Setup random channel
        beforeAll(async ()=>{
            const channelData = await setupChannel(numEntries)
            channelId = channelData.channelId
            channelEntries = channelData.channelEntries
        })

        it(`should delete first entry`, async () => {
            const deleteResult = await request(app)
            .delete(`/${channelId}/${channelEntries[0].uuid}`)
            .expect(200)

            // number of entries in channel should be reduced
            const res = await request(app)
            .get(`/list/${channelId}`)
            .expect(200)
            expect(res.body.profileIds).toHaveLength(numEntries - 1);
            // first entry should not exist anymore
            expect(res.body.profileIds).not.toContain(channelEntries[0].uuid)
            // other entries should still exist
            for (let i=1; i < numEntries; i++) {
                expect(res.body.profileIds).toContain(channelEntries[i].uuid)
            }
        })

        it(`should handle deleting non-existing entry`, async () => {
            const deleteResult = await request(app)
            .delete(`/${channelId}/${channelEntries[0].uuid}`)
            .expect(404)

            // channel list should return correct size
            const res = await request(app)
            .get(`/list/${channelId}`)
            .expect(200)
            expect(res.body.profileIds).toHaveLength(numEntries - 1);
            // first entry should not exist
            expect(res.body.profileIds).not.toContain(channelEntries[0].uuid)
            // other entries should still exist
            for (let i=1; i < numEntries; i++) {
                expect(res.body.profileIds).toContain(channelEntries[i].uuid)
            }
        })
    })

    describe('Delete all entries', () => {

        // Setup random channel
        beforeAll(async ()=>{
            const channelData = await setupChannel(numEntries)
            channelId = channelData.channelId
            channelEntries = channelData.channelEntries
        })

        it('should delete all entries', async () => {
            for (let i=0; i < numEntries; i++) {
                const deleteResult = await request(app)
                .delete(`/${channelId}/${channelEntries[i].uuid}`)
                .expect(200)
            }
        })

        it('Should return empty channel list', async () => {
            const res = await request(app)
            .get(`/list/${channelId}`)
            .expect(200)
            expect(res.body.profileIds).toHaveLength(0);
        })
    })
})
