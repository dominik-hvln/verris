'use client';

import { useState, type CSSProperties } from 'react';

// Stawki godzinowe brutto (PLN): CPU za 1% · RAM za 1 GB · dysk za 1 GB.
const RATE = { cpu: 0.001323, ram: 0.0882, disk: 0.0008 };
const HOURS_MONTH = 730;

const zlH = (n: number) =>
  n.toLocaleString('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' zł / h';
const zlM = (n: number) =>
  n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const fill = (v: number, min: number, max: number): CSSProperties =>
  ({ ['--fill']: `${((v - min) / (max - min)) * 100}%` }) as CSSProperties;

export function MigrationCalculator() {
  const [cpu, setCpu] = useState(100);
  const [ram, setRam] = useState(1);
  const [disk, setDisk] = useState(0);

  const hour = cpu * RATE.cpu + ram * RATE.ram + disk * RATE.disk;
  const month = hour * HOURS_MONTH;

  return (
    <div className="calc">
      <div className="calc-in">
        <h3>Ile dodatkowej mocy potrzebujesz?</h3>
        <p className="hint">
          Ustaw, o ile zasobów ponad pakiet ma urosnąć Twoja strona — zobaczysz koszt godzinowy i
          maksymalny miesięczny.
        </p>

        <div className="slider-group">
          <div className="lbl-row">
            <label htmlFor="sl-cpu">Dodatkowe CPU</label>
            <output htmlFor="sl-cpu">+{cpu}%</output>
          </div>
          <input
            id="sl-cpu"
            type="range"
            min={0}
            max={300}
            step={25}
            value={cpu}
            style={fill(cpu, 0, 300)}
            onChange={(e) => setCpu(Number(e.target.value))}
          />
        </div>

        <div className="slider-group">
          <div className="lbl-row">
            <label htmlFor="sl-ram">Dodatkowy RAM</label>
            <output htmlFor="sl-ram">
              +{ram.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB
            </output>
          </div>
          <input
            id="sl-ram"
            type="range"
            min={0}
            max={4}
            step={0.5}
            value={ram}
            style={fill(ram, 0, 4)}
            onChange={(e) => setRam(Number(e.target.value))}
          />
        </div>

        <div className="slider-group" style={{ marginBottom: 0 }}>
          <div className="lbl-row">
            <label htmlFor="sl-disk">Dodatkowy dysk</label>
            <output htmlFor="sl-disk">+{disk} GB</output>
          </div>
          <input
            id="sl-disk"
            type="range"
            min={0}
            max={50}
            step={1}
            value={disk}
            style={fill(disk, 0, 50)}
            onChange={(e) => setDisk(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="calc-out" aria-live="polite">
        <div className="calc-line">
          <span>Hosting (abonament)</span>
          <span className="v">39,00 zł / mies</span>
        </div>
        <div className="calc-line">
          <span>Dodatkowe zasoby — godzinowo</span>
          <span className="v">{zlH(hour)}</span>
        </div>
        <hr className="calc-sep" />
        <div className="calc-total">
          <span className="lbl">
            Maksymalnie miesięcznie
            <br />
            <small style={{ fontSize: 12, fontWeight: 400, color: 'var(--stone)' }}>
              przy użyciu 24/7 (730 h)
            </small>
          </span>
          <span className="v">{zlM(month)}</span>
        </div>
        <p className="calc-note">
          Płacisz tylko za godziny, w których strona faktycznie używa dodatkowych zasobów — tryb ECO
          zwalnia je automatycznie, gdy ruch spada, więc realny koszt jest zwykle znacznie niższy od
          maksimum. Stawki brutto: 0,001323 zł za 1% CPU/h · 0,0882 zł za 1 GB RAM/h · 0,0008 zł za 1
          GB dysku/h.
        </p>
        <a
          className="btn btn-primary"
          href="https://panel.verris.pl"
          data-event="cta_click"
          data-cta="calculator"
          data-conv="checkout_intent"
        >
          Przenieś stronę za darmo
        </a>
      </div>
    </div>
  );
}
