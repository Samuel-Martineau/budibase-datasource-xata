import { logger } from './logger.js';

export function inspectedMethod(className: string) {
	return function (
		target: any,
		key: string | symbol,
		descriptor: PropertyDescriptor,
	): void {
		const original = descriptor.value as (...args: unknown[]) => unknown;

		descriptor.value = function (...args: any[]): unknown {
			const returnValue = original.apply(this, args);
			if (returnValue instanceof Promise) {
				return returnValue.then((resolvedReturnValue: unknown) => {
					logger.info('{className}.{key}({args}) => {resolvedReturnValue}', {
						className,
						key,
						args,
						resolvedReturnValue,
					});
					return resolvedReturnValue;
				});
			}

			logger.info('%s.%s(%O) => %O', className, key, args, returnValue);
			return returnValue;
		};
	};
}

// from https://stackoverflow.com/a/74898678/12011539
export function decorateAllMethods(decorator: MethodDecorator) {
	return (target: new (...args: any[]) => any): void => {
		const descriptors = Object.getOwnPropertyDescriptors(target.prototype);
		for (const [propName, descriptor] of Object.entries(descriptors)) {
			const isMethod =
				typeof descriptor.value === 'function' && propName !== 'constructor';

			if (!isMethod) {
				continue;
			}

			decorator(target, propName, descriptor);
			Object.defineProperty(target.prototype, propName, descriptor);
		}
	};
}
