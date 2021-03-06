import { SubscriptionManager } from '..';
import { RegisterOptions } from '../types';

export default class BaseSubscriptionManager {
  manager: SubscriptionManager;

  registrations: RegisterOptions[] = [];

  addRegistration<T>(options: RegisterOptions<T>) {
    this.registrations.push(options as RegisterOptions);
    this.manager.register<T>(options);
  }

  reRegister() {
    this.registrations.forEach((options) => this.manager.register(options));
  }

  constructor(manager: SubscriptionManager) {
    this.manager = manager;
  }
}
