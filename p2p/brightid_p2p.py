import socket
from gossip.util import packing, message
import threading
import redis

REDIS_HOST = "localhost"
REDIS_QUEUE = "brightid"

def bytes_to_string(l):
    return "".join(map(chr, l))

def string_to_bytes(s):
    return [ord(i) for i in s]

class Sender(threading.Thread):

    def __init__(self, sock):
        threading.Thread.__init__(self)
        self.sock = sock
        self.redis_con = redis.Redis(host=REDIS_HOST)
        self.queue = REDIS_QUEUE

    def run(self):
        print("Starting Sender ...")
        while True:
            source, data = self.redis_con.blpop([self.queue])
            self.handle_message(data)

    def handle_message(self, data):
        values = packing.pack_gossip_announce(0, 540, string_to_bytes(data))
        packing.send_msg(self.sock, values['code'], values['data'])
        sock.close()

class Receiver(threading.Thread):

    def __init__(self, sock):
        threading.Thread.__init__(self)
        self.sock = sock

    def run(self):
        print("Starting Receiver ...")
        while True:
            values = packing.receive_msg(sock)
            message_object = message.GOSSIP_MESSAGE_TYPES.get(
                values['code'], 
                message.MessageGossipNotification
            )
            msg = message_object(values['message'])
            json_str = bytes_to_string(msg.msg)
            print(json_str)

            #TODO: Ivan: decode json_str and update db

if __name__ == "__main__":
    sock = socket.socket()
    sock.connect(('localhost', 7001))

    values = packing.pack_gossip_notify(540)
    packing.send_msg(sock, values['code'], values['data'])

    receiver = Receiver(sock)
    receiver.daemon = True
    receiver.start()

    sender = Sender(sock)
    sender.daemon = True
    sender.start()

    receiver.join()
    sender.join()
