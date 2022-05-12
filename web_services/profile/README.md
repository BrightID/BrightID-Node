# BrightID profile exchange service

## running locally
After installing dependencies, execute `node server.js`.

To see extended debug info from the Express framework, set DEBUG environment accordingly, e.g. 
by running `DEBUG=express:* node server.js`

## Testing
Tests are implemented with jest and supertest.
Simply run `npm test`. 


## Channel behaviour
Channels have a default TTL of 24 hours.
If all entries of a channel are deleted by a client it is no longer needed. The TTL will reduce to a grace-period
of 10 minute in case another entry upload is pending (e.g. due to slow data connection).

#### Usecase sync device, 1:1 connection:
Works like producer - consumer. One party uploads data, other party downloads and removes. Channel 
can have a long TTL as it either has low amount of data (1:1 connection) or data gets consumed/deleted by 
other party.
Throttling/Retry of upload data should be done, as consumed data gets deleted!

#### Usecase recovery:
1:n connection with low number of participants (recovery connections). Channel should live long (24 hours) to allow recovery
connections enough time to act.
Recovery data uploaded by recovery connections can be removed by initiator once downloaded.
Throttling/Retry of upload data should be done, as consumed data gets deleted!

#### Usecase connection party (group or star channel):
1:n (star) or m:n (group) channel for making connections with high number of participants. No data should be removed from channel as people
joining later need access to all existing data.
No throttling/retry for uploads - If channel is full no one can join anymore.
