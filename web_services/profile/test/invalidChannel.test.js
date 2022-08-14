const { v4: uuidv4 } = require('uuid');
const request = require('supertest')
const app = require('../app')

const profileA = {
    data: "Profile A Data",
    uuid: uuidv4(),
};
const channel = uuidv4();

describe('Invalid channel', () => {

    it('should return 404 when listing invalid channel', async () => {
        const res = await request(app)
        .get(`/list/${channel}`)
        .expect(404)
        expect(res.body).toHaveProperty('error', `channelId ${channel} not found`)
    })

})
