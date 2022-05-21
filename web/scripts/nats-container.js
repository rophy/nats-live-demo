// -- note drawing-container.js must be included above this module

import { connect, StringCodec, AckPolicy } from './nats.js'
import { EventPublisherDrawingContainer, EventSubscriberDrawingContainer } from './drawing-container.js'

function assert(expr, message) {
  if(!Boolean(expr)) {
    throw new Error(message || 'unknown assertion error');
  }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// debug
window.connect = connect;

const sc = StringCodec();

// a global incrementing counter for troubleshooting convinence.
let globalInstanceId = 0;

/**
 * extend the basic point drawing canvas so that instances listen for
 * messages on the given NATS instance which are then drawn as points
 */
class NATSSubscriberDrawingContainer extends EventSubscriberDrawingContainer
{
    constructor(counterElementName,
                configuration,
                statisticsCallback
              )
    {
        super(counterElementName, configuration, statisticsCallback);
        this.instanceId = `subscriber_${++globalInstanceId}`;
    }

    // -- receiver methods

    async startWebSocket(onConnectedCallback)
    {
        try {
            if (this.nc) {
                await this.nc.close();
                await this.nc.closed();
                delete this.nc;
            }
            this.nc = await connect({ servers: this.configuration.nats_url });
            console.log(this.instanceId, `connected to ${this.nc.getServer()}`);

            if (!this.configuration.enableJetstream) {

                const sub = this.nc.subscribe(this.configuration.topic, {
                    queue: this.configuration.enableQueueGroup ? this.configuration.queue : null
                });
                onConnectedCallback();
                await this.consumeMessages(sub);
                console.log(this.instanceId, "subscription closed");

            } else {

                // jetstream
                const jsm = await this.nc.jetstreamManager();
                this.jsm = jsm;

                // list all the streams, the `next()` function
                // retrieves a paged result.
                let myStream = null;
                while (!myStream) {
                    let streams = await jsm.streams.list().next();
                    streams.forEach((si) => {
                        if (si.config.name === this.configuration.stream ) {
                            myStream = si;
                        }
                    });
                    if (!myStream) {
                        console.log(this.instanceId, `waiting for stream "${this.configuration.stream}" to show up...`);
                        await sleep(3000);
                    }
                }

                const js = this.nc.jetstream();
                let psub = null;
                if (this.configuration.enablePushMode) {
                    console.log(this.instanceId, 'subscribing', this.configuration.topic);
                    psub = await js.subscribe(this.configuration.topic, {
                        stream: this.configuration.stream,
                        config: {
                            // a unique delivery subject to "push" to messages to.
                            deliver_subject: `${this.instanceId}_${Date.now()}`,
                            ack_policy: AckPolicy.None
                        }
                    });
                } else {
                    psub = await js.pullSubscribe(this.configuration.topic, {
                        stream: this.configuration.stream,
                        config: {
                            durable_name: this.configuration.consumer
                        }
                    });
                }

                onConnectedCallback();
                this.consumeMessages(psub);
                if (!this.configuration.enablePushMode) while (true) {
                    await psub.pull({ batch: this.configuration.batchSize, expires: this.configuration.loopDelay });
                    await sleep(this.configuration.loopDelay);
                }
            }
        } catch (err) {
            return onConnectedCallback(err);
        }

    }

    async getConsumerInfo() {
        let info = await this.jsm.consumers.info(this.configuration.stream, this.configuration.consumer);
        return info;
    }

    async consumeMessages(sub) {
        for await (const m of sub) {
            let point = JSON.parse(sc.decode(m.data));
            console.log(this.instanceId, point);
            this.processMessage(point);
            await new Promise(r => setTimeout(r, this.configuration.playbackDelay));
        }
        console.log(this.instanceId, 'done consuming messages');
    }

    async stopWebSocket(onDisconnectedCallback) {
        if (this.nc) {
            await this.nc.close();
            await this.nc.closed();
            console.log(this.instanceId, 'connection closed.');
            delete this.nc;
        }
        if (onDisconnectedCallback) onDisconnectedCallback();
    }


}

/**
 * extend the basic point drawing canvas so that instances listen for
 * messages on the given NATS instance which are then drawn as points
 */
class NATSPublisherDrawingContainer extends EventPublisherDrawingContainer
{
    constructor(counterElementName,
                configuration,
                statisticsCallback
              )
    {
        super(counterElementName, configuration, statisticsCallback);
        this.instanceId = `publisher_${++globalInstanceId}`;

        var self = this;
        this.nc = null;

        this.canvas.node.onmousemove = function(e)
        {
            if(!self.isDrawing)
            {
                return;
            }

            self.lastMouseMoveTime = e.timeStamp;

            var x = e.clientX - self.offset(this).left;
            var y = e.clientY - self.offset(this).top;

            async function pointIdleDispatch(point)
            {
                let payload = { x:x, y:y, timestamp: new Date().getTime(), c: self.configuration.color};
                await self.nc.publish(
                  self.configuration.topic,
                  sc.encode(JSON.stringify(payload))
                );
                self.statistics.MessagesSent++;
                self.BroadcastStatistics();
            }

            window.setTimeout(pointIdleDispatch, {x:x, y:y});
            self.drawPoint(x,y);
        };

        this.canvas.node.onmousedown = function(e)
        {
            self.isDrawing = true;
        };

        this.canvas.node.onmouseup = function(e)
        {
            self.isDrawing = false;
        };

        // send clicks through as a single mouse move
        this.canvas.node.onclick = function(e)
        {
            self.isDrawing = true;
            self.canvas.node.onmousemove(e);
            self.isDrawing = false;
        };
    }

    async startWebSocket(onConnectedCallback) {
        try {
            if (this.nc) {
                await this.nc.close();
                await this.nc.closed();
                delete this.nc;
            }
            this.nc = await connect({ servers: this.configuration.nats_url });
            console.log(this.instanceId, `connected to ${this.nc.getServer()}`);

            if (this.configuration.enableJetstream) {
                // jetstream

                assert(this.configuration.stream, 'missing config "stream"');
                const jsm = await this.nc.jetstreamManager();
                this.jsm = jsm;

                // list all the streams, the `next()` function
                // retrieves a paged result.
                const streams = await jsm.streams.list().next();
                let myStream = null;
                streams.forEach((si) => {
                    if (si.config.name === this.configuration.stream ) {
                        myStream = si;
                    }
                });

                if (!myStream) {
                    // add a stream
                    await jsm.streams.add({ name: this.configuration.stream, subjects: [this.configuration.topic] });
                    console.log(`stream "${this.configuration.stream}" created for subject "${this.configuration.topic}".`)
                }
            }

            onConnectedCallback();
        } catch (err) {
            console.error(err);
            onConnectedCallback(err);
        }
    }

    async stopWebSocket(onDisconnectedCallback) {
        if (this.nc) {
            await this.nc.close();
            await this.nc.closed();
            delete this.nc;
            console.log(this.instanceId, 'connection closed.');
        }
        if (onDisconnectedCallback) onDisconnectedCallback();
    }

}

export { NATSPublisherDrawingContainer, NATSSubscriberDrawingContainer };