import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockServiceWorker extends EventTarget {
  state: ServiceWorkerState = 'installing';
  postMessage = vi.fn();

  setState(nextState: ServiceWorkerState) {
    this.state = nextState;
    this.dispatchEvent(new Event('statechange'));
  }
}

class MockServiceWorkerRegistration extends EventTarget {
  waiting: ServiceWorker | null = null;
  installing: ServiceWorker | null = null;
  update = vi.fn().mockResolvedValue(undefined);
}

class MockServiceWorkerContainer extends EventTarget {
  controller: ServiceWorker | null = null;
  register = vi.fn(async (scopeUrl: string) => {
    void scopeUrl;
    return {} as ServiceWorkerRegistration;
  });
}

describe('pwa manager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.stubGlobal('__APP_BUILD_ID__', 'test-build');
  });

  it('notifies update availability and activates via skip waiting', async () => {
    const registration = new MockServiceWorkerRegistration();
    const installingWorker = new MockServiceWorker();
    const serviceWorkerContainer = new MockServiceWorkerContainer();
    serviceWorkerContainer.controller = {} as ServiceWorker;
    serviceWorkerContainer.register.mockResolvedValue(registration as unknown as ServiceWorkerRegistration);
    registration.installing = installingWorker as unknown as ServiceWorker;

    const loadListeners: Array<() => void> = [];
    const mockWindow = {
      addEventListener: (name: string, listener: EventListener) => {
        if (name === 'load') {
          loadListeners.push(() => listener(new Event('load')));
        }
      },
      location: {
        reload: vi.fn(),
      },
    };

    const mockNavigator = {
      serviceWorker: serviceWorkerContainer,
    };

    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('navigator', mockNavigator);

    const manager = await import('./pwa-manager');
    vi.spyOn(manager.pwaRuntime, 'isDev').mockReturnValue(false);
    const reloadMock = vi.spyOn(manager.pwaRuntime, 'reloadPage').mockImplementation(() => undefined);

    const updateListener = vi.fn();
    const unsubscribe = manager.subscribeToPwaUpdate(updateListener);

    manager.registerPwa();
    for (const listener of loadListeners) {
      listener();
    }

    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(serviceWorkerContainer.register).toHaveBeenCalled();
    expect(registration.update).toHaveBeenCalled();

    installingWorker.setState('installed');
    expect(updateListener).toHaveBeenCalledTimes(1);
    expect(manager.hasPendingPwaUpdate()).toBe(true);

    manager.activatePwaUpdate();
    expect(installingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    serviceWorkerContainer.dispatchEvent(new Event('controllerchange'));
    expect(reloadMock).toHaveBeenCalledTimes(1);

    unsubscribe();
    vi.unstubAllGlobals();
  });
});
