/**
 * Copyright 2015 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Storage, Store, LocalStorageBinding, ViewerStorageBinding} from
    '../../src/service/storage-impl';
import {all} from '../../src/promise';
import * as sinon from 'sinon';


describe('Storage', () => {
  let sandbox;
  let storage;
  let binding;
  let bindingMock;
  let viewer;
  let viewerMock;
  let windowApi;
  let viewerBroadcastHandler;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();

    viewerBroadcastHandler = undefined;
    viewer = {
      onBroadcast: handler => {
        viewerBroadcastHandler = handler;
      },
      broadcast: () => {}
    };
    viewerMock = sandbox.mock(viewer);

    windowApi = {
      document: {
        cookie: 'AMP_EXP=amp-storage'
      },
      location: 'https://acme.com/document1',
    };

    binding = {
      loadBlob: () => {},
      saveBlob: () => {},
    };
    bindingMock = sandbox.mock(binding);

    storage = new Storage(windowApi, viewer, binding);
    storage.start_();
  });

  afterEach(() => {
    sandbox.restore();
    sandbox = null;
  });

  function expectStorage(keyValues) {
    const list = [];
    for (const k in keyValues) {
      list.push(storage.get(k).then(value => {
        const expectedValue = keyValues[k];
        expect(value).to.equal(expectedValue, `For "${k}"`);
      }));
    }
    return all(list);
  }

  it('should initialize with experiment', () => {
    expect(viewerBroadcastHandler).to.exist;
  });

  it('should not initialize without experiment', () => {
    viewerBroadcastHandler = undefined;
    windowApi.document.cookie = '';
    new Storage(windowApi, viewer, binding).start_();
    expect(viewerBroadcastHandler).to.not.exist;
  });

  it('should configure store correctly', () => {
    const store1 = new Store({});
    store1.set('key1', 'value1');
    store1.set('key2', 'value2');
    bindingMock.expects('loadBlob')
        .withExactArgs('https://acme.com')
        .returns(btoa(JSON.stringify(store1.obj)))
        .once();
    return storage.get('key1').then(() => {
      return storage.storePromise_;
    }).then(store => {
      expect(store.maxValues_).to.equal(8);
    });
  });

  it('should get the value first time and reuse store', () => {
    const store1 = new Store({});
    store1.set('key1', 'value1');
    store1.set('key2', 'value2');
    bindingMock.expects('loadBlob')
        .withExactArgs('https://acme.com')
        .returns(btoa(JSON.stringify(store1.obj)))
        .once();
    expect(storage.storePromise_).to.not.exist;
    const promise = storage.get('key1');
    return promise.then(value => {
      expect(value).to.equal('value1');
      const store1Promise = storage.storePromise_;
      expect(store1Promise).to.exist;

      // Repeat.
      return storage.get('key2').then(value2 => {
        expect(value2).to.equal('value2');
        expect(storage.storePromise_).to.equal(store1Promise);
      });
    });
  });

  it('should get the value from first ever request and reuse store', () => {
    bindingMock.expects('loadBlob')
        .withExactArgs('https://acme.com')
        .returns(null)
        .once();
    expect(storage.storePromise_).to.not.exist;
    const promise = storage.get('key1');
    return promise.then(value => {
      expect(value).to.be.undefined;
      const store1Promise = storage.storePromise_;
      expect(store1Promise).to.exist;

      // Repeat.
      return storage.get('key2').then(value2 => {
        expect(value2).to.be.undefined;
        expect(storage.storePromise_).to.equal(store1Promise);
      });
    });
  });

  it('should recover from binding failure', () => {
    bindingMock.expects('loadBlob')
        .withExactArgs('https://acme.com')
        .returns(Promise.reject('intentional'))
        .once();
    expect(storage.storePromise_).to.not.exist;
    const promise = storage.get('key1');
    return promise.then(value => {
      expect(value).to.be.undefined;
      expect(storage.storePromise_).to.exist;
    });
  });

  it('should recover from binding error', () => {
    bindingMock.expects('loadBlob')
        .withExactArgs('https://acme.com')
        .returns(Promise.resolve('UNKNOWN FORMAT'))
        .once();
    expect(storage.storePromise_).to.not.exist;
    const promise = storage.get('key1');
    return promise.then(value => {
      expect(value).to.be.undefined;
      expect(storage.storePromise_).to.exist;
    });
  });

  it('should save the value first time and reuse store', () => {
    const store1 = new Store({});
    store1.set('key1', 'value1');
    store1.set('key2', 'value2');
    bindingMock.expects('loadBlob')
        .withExactArgs('https://acme.com')
        .returns(btoa(JSON.stringify(store1.obj)))
        .once();
    bindingMock.expects('saveBlob')
        .withExactArgs('https://acme.com', sinon.match(arg => {
          const store2 = new Store(JSON.parse(atob(arg)));
          return (store2.get('key1') !== undefined &&
              store2.get('key2') !== undefined);
        }))
        .returns(Promise.resolve())
        .twice();
    viewerMock.expects('broadcast')
        .withExactArgs(sinon.match(arg => {
          return (arg['type'] == 'amp-storage-reset' &&
              arg['origin'] == 'https://acme.com');
        }))
        .twice();
    expect(storage.storePromise_).to.not.exist;
    const promise = storage.set('key1', true);
    return promise.then(() => {
      const store1Promise = storage.storePromise_;
      expect(store1Promise).to.exist;

      // Repeat.
      return storage.set('key2', true).then(() => {
        expect(storage.storePromise_).to.equal(store1Promise);
      });
    }).then(() => {
      return expectStorage({
        'key1': true,
        'key2': true,
      });
    });
  });

  it('should remove the key first time and reuse store', () => {
    const store1 = new Store({});
    store1.set('key1', 'value1');
    store1.set('key2', 'value2');
    bindingMock.expects('loadBlob')
        .withExactArgs('https://acme.com')
        .returns(btoa(JSON.stringify(store1.obj)))
        .once();
    bindingMock.expects('saveBlob')
        .withExactArgs('https://acme.com', sinon.match(arg => {
          const store2 = new Store(JSON.parse(atob(arg)));
          return (store2.get('key1') === undefined);
        }))
        .returns(Promise.resolve())
        .twice();
    viewerMock.expects('broadcast')
        .withExactArgs(sinon.match(arg => {
          return (arg['type'] == 'amp-storage-reset' &&
              arg['origin'] == 'https://acme.com');
        }))
        .twice();
    expect(storage.storePromise_).to.not.exist;
    const promise = storage.remove('key1');
    return promise.then(() => {
      const store1Promise = storage.storePromise_;
      expect(store1Promise).to.exist;

      // Repeat.
      return storage.remove('key2').then(() => {
        expect(storage.storePromise_).to.equal(store1Promise);
      });
    }).then(() => {
      return expectStorage({
        'key1': undefined,
        'key2': undefined,
      });
    });
  });

  it('should react to reset messages', () => {
    const store1 = new Store({});
    store1.set('key1', 'value1');
    bindingMock.expects('loadBlob')
        .withExactArgs('https://acme.com')
        .returns(btoa(JSON.stringify(store1.obj)))
        .twice();
    return storage.get('key1').then(value => {
      expect(value).to.equal('value1');
      const store1Promise = storage.storePromise_;
      expect(store1Promise).to.exist;

      // Issue broadcast event.
      viewerBroadcastHandler({
        'type': 'amp-storage-reset',
        'origin': 'https://acme.com'
      });
      expect(storage.storePromise_).to.not.exist;
      return storage.get('key1').then(value => {
        expect(value).to.equal('value1');
        expect(storage.storePromise_).to.exist;
      });
    });
  });

  it('should ignore unrelated reset messages', () => {
    const store1 = new Store({});
    store1.set('key1', 'value1');
    bindingMock.expects('loadBlob')
        .withExactArgs('https://acme.com')
        .returns(btoa(JSON.stringify(store1.obj)))
        .twice();
    return storage.get('key1').then(value => {
      expect(value).to.equal('value1');
      const store1Promise = storage.storePromise_;
      expect(store1Promise).to.exist;

      // Issue broadcast event.
      viewerBroadcastHandler({
        'type': 'amp-storage-reset',
        'origin': 'OTHER'
      });
      expect(storage.storePromise_).to.exist;
    });
  });
});


describe('Store', () => {
  let sandbox;
  let clock;
  let store;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    clock = sandbox.useFakeTimers();
    store = new Store({}, 2);
  });

  afterEach(() => {
    clock.restore();
    clock = null;
    sandbox.restore();
    sandbox = null;
  });

  it('should get undefined with empty store', () => {
    expect(store.get('key1')).to.be.undefined;
    expect(Object.keys(store.values_).length).to.equal(0);
    expect(store.values_).to.deep.equal({});
  });

  it('should set a new value with timestamp', () => {
    store.set('key2', 'value2');
    clock.tick(101);
    store.set('key1', 'value1');
    expect(store.get('key1')).to.equal('value1');
    expect(Object.keys(store.values_).length).to.equal(2);
    expect(store.values_['key2']['t']).to.equal(0);
    expect(store.values_['key1']['t']).to.equal(101);
    expect(store.values_).to.deep.equal({
      'key2': {v: 'value2', t: 0},
      'key1': {v: 'value1', t: 101}
    });
  });

  it('should overwrite a value with new timestamp', () => {
    store.set('key1', 'value1');
    store.set('key2', 'value2');
    clock.tick(101);
    store.set('key1', 'value1b');
    expect(store.get('key1')).to.equal('value1b');
    expect(Object.keys(store.values_).length).to.equal(2);
    expect(store.values_['key1']['t']).to.equal(101);
    expect(store.values_['key2']['t']).to.equal(0);
    expect(store.values_).to.deep.equal({
      'key1': {v: 'value1b', t: 101},
      'key2': {v: 'value2', t: 0}
    });
  });

  it('should remove a value', () => {
    store.set('key1', 'value1');
    store.set('key2', 'value2');
    clock.tick(101);
    expect(Object.keys(store.values_).length).to.equal(2);
    store.remove('key1');
    expect(store.get('key1')).to.be.undefined;
    expect(store.get('key2')).to.be.equal('value2');
    expect(Object.keys(store.values_).length).to.equal(1);
    expect(store.values_['key2']['t']).to.equal(0);
    expect(store.values_).to.deep.equal({
      'key2': {v: 'value2', t: 0}
    });
  });

  it('should store limited amount of values', () => {
    clock.tick(1);
    store.set('k1', 1);
    expect(Object.keys(store.values_).length).to.equal(1);

    clock.tick(1);
    store.set('k2', 2);
    expect(Object.keys(store.values_).length).to.equal(2);

    // The oldest (k2) will be removed.
    clock.tick(1);
    store.set('k1', 4);
    store.set('k3', 3);
    expect(Object.keys(store.values_).length).to.equal(2);
    expect(store.get('k3')).to.equal(3);
    expect(store.get('k1')).to.equal(4);
    expect(store.get('k2')).to.be.undefined;

    // The new oldest (k1) will be removed
    clock.tick(1);
    store.set('k4', 4);
    expect(Object.keys(store.values_).length).to.equal(2);
    expect(store.get('k4')).to.equal(4);
    expect(store.get('k3')).to.equal(3);
    expect(store.get('k1')).to.be.undefined;
    expect(store.get('k2')).to.be.undefined;
  });
});


describe('LocalStorageBinding', () => {
  let sandbox;
  let windowApi;
  let localStorageMock;
  let binding;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    windowApi = {
      localStorage: {
        getItem: () => {},
        setItem: () => {},
      }
    };
    localStorageMock = sandbox.mock(windowApi.localStorage);
    binding = new LocalStorageBinding(windowApi);
  });

  afterEach(() => {
    sandbox.restore();
    sandbox = null;
  });

  it('should load store when available', () => {
    localStorageMock.expects('getItem')
        .withExactArgs('amp-store:https://acme.com')
        .returns('BLOB1')
        .once();
    return binding.loadBlob('https://acme.com').then(blob => {
      expect(blob).to.equal('BLOB1');
    });
  });

  it('should load default store when not yet available', () => {
    localStorageMock.expects('getItem')
        .withExactArgs('amp-store:https://acme.com')
        .returns(undefined)
        .once();
    return binding.loadBlob('https://acme.com').then(blob => {
      expect(blob).to.not.exist;
    });
  });

  it('should reject on local storage failure', () => {
    localStorageMock.expects('getItem')
        .withExactArgs('amp-store:https://acme.com')
        .throws(new Error('unknown'))
        .once();
    return binding.loadBlob('https://acme.com')
        .then(() => 'SUCCESS', () => 'ERROR').then(res => {
          expect(res).to.equal('ERROR');
        });
  });

  it('should save store', () => {
    localStorageMock.expects('setItem')
        .withExactArgs('amp-store:https://acme.com', 'BLOB1')
        .once();
    return binding.saveBlob('https://acme.com', 'BLOB1');
  });

  it('should reject on save store failure', () => {
    localStorageMock.expects('setItem')
        .withExactArgs('amp-store:https://acme.com', 'BLOB1')
        .throws(new Error('unknown'))
        .once();
    return binding.saveBlob('https://acme.com', 'BLOB1')
        .then(() => 'SUCCESS', () => 'ERROR').then(res => {
          expect(res).to.equal('ERROR');
        });
  });
});


describe('ViewerStorageBinding', () => {
  let sandbox;
  let viewer;
  let viewerMock;
  let binding;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    viewer = {
      sendMessage: () => {}
    };
    viewerMock = sandbox.mock(viewer);
    binding = new ViewerStorageBinding(viewer);
  });

  afterEach(() => {
    sandbox.restore();
    sandbox = null;
  });

  it('should load store from viewer', () => {
    viewerMock.expects('sendMessage')
        .withExactArgs('loadStore', sinon.match(arg => {
          return (arg['origin'] == 'https://acme.com');
        }), true)
        .returns(Promise.resolve({'blob': 'BLOB1'}))
        .once();
    return binding.loadBlob('https://acme.com').then(blob => {
      expect(blob).to.equal('BLOB1');
    });
  });

  it('should load default store when not yet available', () => {
    viewerMock.expects('sendMessage')
        .withExactArgs('loadStore', sinon.match(arg => {
          return (arg['origin'] == 'https://acme.com');
        }), true)
        .returns(Promise.resolve({}))
        .once();
    return binding.loadBlob('https://acme.com').then(blob => {
      expect(blob).to.not.exist;
    });
  });

  it('should reject on viewer failure', () => {
    viewerMock.expects('sendMessage')
        .withExactArgs('loadStore', sinon.match(arg => {
          return (arg['origin'] == 'https://acme.com');
        }), true)
        .returns(Promise.reject('unknown'))
        .once();
    return binding.loadBlob('https://acme.com')
        .then(() => 'SUCCESS', () => 'ERROR').then(res => {
          expect(res).to.equal('ERROR');
        });
  });

  it('should save store', () => {
    viewerMock.expects('sendMessage')
        .withExactArgs('saveStore', sinon.match(arg => {
          return (arg['origin'] == 'https://acme.com' &&
              arg['blob'] == 'BLOB1');
        }), true)
        .returns(Promise.resolve())
        .once();
    return binding.saveBlob('https://acme.com', 'BLOB1');
  });

  it('should reject on save store failure', () => {
    viewerMock.expects('sendMessage')
        .withExactArgs('saveStore', sinon.match(() => true), true)
        .returns(Promise.reject('unknown'))
        .once();
    return binding.saveBlob('https://acme.com', 'BLOB1')
        .then(() => 'SUCCESS', () => 'ERROR').then(res => {
          expect(res).to.equal('ERROR');
        });
  });
});