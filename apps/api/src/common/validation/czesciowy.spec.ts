import { IsInt, IsString, MinLength } from 'class-validator';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Czesciowy } from './czesciowy';

class Pelny {
  @IsString() @MinLength(2) nazwa!: string;
  @IsInt() liczba!: number;
}
class Zmiana extends Czesciowy(Pelny) {}

const bledy = (klasa: new () => object, v: object) =>
  validateSync(plainToInstance(klasa, v), { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);

it('pełny DTO wymaga pól, częściowy nie', () => {
  expect(bledy(Pelny, {})).toEqual(['nazwa', 'liczba']);
  expect(bledy(Zmiana, {})).toEqual([]);
});

it('podane pole częściowego DTO nadal przechodzi reguły, obce klucze odpadają', () => {
  expect(bledy(Zmiana, { nazwa: 'x' })).toEqual(['nazwa']);
  expect(bledy(Zmiana, { liczba: 'dwa' })).toEqual(['liczba']);
  expect(bledy(Zmiana, { nazwa: 'ok', obce: 1 })).toEqual(['obce']);
  expect(bledy(Zmiana, { nazwa: 'ok' })).toEqual([]);
});

it('klasa bazowa zostaje nietknięta', () => {
  expect(bledy(Pelny, { nazwa: 'ok' })).toEqual(['liczba']);
});
