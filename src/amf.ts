
// Shorter of Buffer.concat
export function bufConcat (buf: Buffer[]): Buffer {
    return Buffer.concat(buf, buf.map(b => b.length).reduce((a,c) => a+c));
}

export function stringBuf (val: string): Buffer {
    const size = Buffer.alloc(2);
    const strbuf = Buffer.from(val);
    size.writeUInt16BE(strbuf.length, 0);
    return bufConcat([size, strbuf]);
}

export function makeAMF0Buf (n: string|number): Buffer {
    if (typeof n === 'string') {
        const head = Buffer.alloc(3);
        head.writeUInt8(2, 0);
        head.writeUInt16BE(n.length, 1);
        const body = Buffer.from(n);
        return Buffer.concat([head, body], head.length + body.length);

    } else if (typeof n === 'number') {
        const body = Buffer.alloc(9);
        body.writeDoubleBE(n, 1);
        return body;
    } else {
        throw new Error('Invalid value type');
    }
}

export function makeAMF0Obj (obj: Map<string, string|number>): Buffer {
    const head = Buffer.from('03', 'hex');
    const bufs = [...obj].map(i => {
        const prop = stringBuf(i[0]);
        const val = makeAMF0Buf(i[1]);
        return Buffer.concat([prop, val], prop.length + val.length);
    });
    const end = Buffer.from('000009', 'hex');
    return bufConcat([head, ...bufs, end]);
}

// Decoder

enum AMF0T {
    Number = 0x00,
    Boolean = 0x01,
    String = 0x02,
    Object = 0x03,
    Null = 0x05,
    Array = 0x08
}

const AMF0End = 0x000009;

export function decodeAMF0 (buf: Buffer): any[] {
    const res = [];
    const size = buf.length;
    let offset = 0;
    while (size - offset > 0) {
        const type = buf.readUInt8(offset);
        switch (type) {
            case AMF0T.Number: {
                const d = buf.readDoubleBE(offset+1);
                res.push(d);
                offset += 9;
                break;
            }
            case AMF0T.Boolean: {
                const d = buf.readUInt8(offset+1);
                res.push(Boolean(d));
                offset += 2;
                break;
            }
            case AMF0T.String: {
                const length = buf.readUInt16BE(offset+1);
                const d = buf.slice(offset+3, offset+3+length);
                res.push(d.toString('utf8'));
                offset += 3+length;
                break;
            }
            case AMF0T.Object: {
                const map = new Map();
                let amfoff = offset+1;
                do {
                    const nameSize = buf.readUInt16BE(amfoff);
                    const name = buf.slice(amfoff+=2, amfoff+=nameSize).toString('utf8');
                    const valType = buf.readUInt8(amfoff);
                    amfoff+=1;
                    let value;
                    if (valType == AMF0T.Number) {
                        value = buf.readDoubleBE(amfoff);
                        amfoff += 8;
                    } else {
                        const strSize = buf.readUInt16BE(amfoff);
                        value = buf.slice(amfoff+=2, amfoff+=strSize).toString('utf8');
                    }
                    map.set(name, value);
                } while (buf.readUIntBE(amfoff, 3) !== AMF0End);
                offset += amfoff + 3;
                res.push(map);
                break;
            }
            case AMF0T.Null: {
                res.push(null);
                offset += 1;
                break;
            }
            case AMF0T.Array: {
                let amfoff = offset + 1;
                const map = new Map();
                const arrayLength = buf.readUInt32BE(amfoff);
                amfoff += 4;
                for (let i=0; i<arrayLength; i++) {
                    const keyLength = buf.readUInt16BE(amfoff);
                    amfoff += 2;
                    const key = buf.slice(amfoff, amfoff+=keyLength).toString('utf8');
                    let value;
                    const valType = buf.readUInt8(amfoff);
                    amfoff += 1;
                    if (valType === AMF0T.Number) {
                        value = buf.readDoubleBE(amfoff);
                        amfoff += 8;
                    } else if (valType === AMF0T.String) {
                        const strSize = buf.readUInt16BE(amfoff);
                        value = buf.slice(amfoff+=2, amfoff+=strSize).toString('utf8');
                    } else if (valType === AMF0T.Boolean) {
                        value = Boolean(buf.readUInt8(amfoff));
                        amfoff += 1;
                    }
                    map.set(key, value);
                }
                offset += amfoff + 3;
                res.push(map);
                break;
            }
        }
    }
    return res;
}
