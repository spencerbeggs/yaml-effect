import { Effect } from "effect";

export const runEffect = <A, E>(effect: Effect.Effect<A, E>): A => Effect.runSync(effect);

export const runEffectEither = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(Effect.either(effect));

export const runEffectAsync = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect);
