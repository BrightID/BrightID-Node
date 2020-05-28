const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const app = require('../app')

const profileA = {
    data: "Profile A Data",
    uuid: uuidv4(),
};

const profileB = {
    data: "Profile B Data",
    uuid: uuidv4(),
};

const profileC = {
    data: "Profile C Data",
    uuid: uuidv4(),
};

const channel = uuidv4();

describe('Multiple profile responses', () => {

    // Upload initiator profile
    beforeAll(async () => {
        const res = await request(app)
        .post(`/upload/${channel}`)
        .send(profileA)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)
    })

    it('should return list of channel profiles UUIDs containing only profileA', async () => {
        const res = await request(app)
        .get(`/list/${channel}`)
        .expect(200)
        const expectedResult = JSON.stringify({profiles: [ profileA.uuid ]})
        expect(res.text).toEqual(expectedResult)
    })

    it('should upload responder profile B', async () => {
        const res = await request(app)
        .post(`/upload/${channel}`)
        .send(profileB)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)
    })

    it('should upload additional responder profile C', async () => {
        const res = await request(app)
        .post(`/upload/${channel}`)
        .send(profileC)
        .expect(201)
        expect(res.body).toHaveProperty('success', true)
    })

    it('should return list of channel profile UUIDs containing profile A, B and C', async () => {
        const res = await request(app).get(`/list/${channel}`)
        expect(res.statusCode).toEqual(200)
        const expectedResult = JSON.stringify({profiles: [ profileA.uuid, profileB.uuid, profileC.uuid ]})
        expect(res.text).toEqual(expectedResult)
    })

    let index=0
    for (const profile of [profileA, profileB, profileC]) {
        index++;
        it(`should download profile ${index} of channel ${channel}`, async () => {
            const res = await request(app).get(`/download/${channel}/${profile.uuid}`)
            expect(res.statusCode).toEqual(200)
            expect(res.text).toEqual(JSON.stringify({data: profile.data}))
        });
    }

})
