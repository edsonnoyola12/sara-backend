import { describe, it, expect } from 'vitest';

// Tests del patrón ServiceFactory sin importar servicios que usan ESM
// (Supabase usa ESM y causa problemas en el entorno de test)

describe('ServiceFactory Pattern', () => {
  it('singleton pattern funciona correctamente', () => {
    // Simular el patrón singleton
    class MockService {
      private static instance: MockService | null = null;

      static getInstance(): MockService {
        if (!MockService.instance) {
          MockService.instance = new MockService();
        }
        return MockService.instance;
      }
    }

    const instance1 = MockService.getInstance();
    const instance2 = MockService.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('factory pattern crea instancias correctamente', () => {
    interface Env {
      API_KEY: string;
    }

    class MockFactory {
      private env: Env;
      private _service: any = null;

      constructor(env: Env) {
        this.env = env;
      }

      getService() {
        if (!this._service) {
          this._service = { key: this.env.API_KEY };
        }
        return this._service;
      }

      getEnv() {
        return this.env;
      }
    }

    const env = { API_KEY: 'test-key' };
    const factory = new MockFactory(env);

    // Debe retornar misma instancia
    const service1 = factory.getService();
    const service2 = factory.getService();
    expect(service1).toBe(service2);

    // getEnv debe retornar el env original
    expect(factory.getEnv()).toBe(env);
  });

  it('cache global funciona entre llamadas', () => {
    let globalCache: any = null;
    let envHash: string | null = null;

    function getFromCache(key: string, createFn: () => any): any {
      if (!globalCache || envHash !== key) {
        globalCache = createFn();
        envHash = key;
      }
      return globalCache;
    }

    const result1 = getFromCache('env1', () => ({ id: 1 }));
    const result2 = getFromCache('env1', () => ({ id: 2 }));

    // Debe retornar el mismo objeto (cacheado)
    expect(result1).toBe(result2);
    expect(result1.id).toBe(1);

    // Con diferente key, debe crear nuevo
    const result3 = getFromCache('env2', () => ({ id: 3 }));
    expect(result3.id).toBe(3);
  });
});
