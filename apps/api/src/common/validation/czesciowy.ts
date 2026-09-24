import { getMetadataStorage, IsOptional } from 'class-validator';

/**
 * Wersja DTO do PATCH: te same reguły co w `Base`, ale każde pole opcjonalne.
 * Odpowiednik `PartialType` z @nestjs/mapped-types bez dokładania zależności.
 * `IsOptional` na klasie potomnej wyłącza sprawdzanie pola tylko wtedy, gdy go nie ma (lub jest null).
 */
export function Czesciowy<T extends object>(Base: new () => T): new () => Partial<T> {
  class Czesciowa extends (Base as new () => object) {}
  const pola = new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(Base, '', true, false)
      .map((m) => m.propertyName),
  );
  for (const pole of pola) IsOptional()(Czesciowa.prototype, pole);
  return Czesciowa as new () => Partial<T>;
}
