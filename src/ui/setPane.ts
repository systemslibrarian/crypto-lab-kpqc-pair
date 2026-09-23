export function renderSetPane(root: HTMLElement): void {
  root.innerHTML = `
    <div class="panel-heading set-heading">
      <div>
        <p class="eyebrow">THE COMPLETE KpqC FOUR</p>
        <h2>Same jobs, different foundations</h2>
        <p>The suite covers key establishment and signatures with more than one mathematical family. That diversity is the lesson: post-quantum cryptography is a portfolio of assumptions, not one replacement algorithm.</p>
      </div>
    </div>

    <div class="family-tree" role="list" aria-label="KpqC algorithm family tree">
      <section class="family-column" role="listitem" aria-labelledby="kem-family">
        <div class="family-label"><span>KEM</span><h3 id="kem-family">Establish a shared key</h3></div>
        <article class="family-node current">
          <p class="node-kind">NTRU lattice</p>
          <h4>NTRU+</h4>
          <p>NTRU quotient-ring arithmetic, SOTP encoding, and a ciphertext validity check.</p>
          <span>THIS LAB</span>
        </article>
        <article class="family-node sibling">
          <p class="node-kind">Module lattice</p>
          <h4>SMAUG-T</h4>
          <p>A separate KEM design based on module-lattice assumptions.</p>
          <a href="https://systemslibrarian.github.io/crypto-lab-quantum-vault-kpqc/">OPEN QUANTUM VAULT</a>
        </article>
      </section>

      <section class="family-column signature-family" role="listitem" aria-labelledby="sig-family">
        <div class="family-label"><span>SIGNATURE</span><h3 id="sig-family">Authenticate a message</h3></div>
        <article class="family-node current">
          <p class="node-kind">Symmetric / MPCitH</p>
          <h4>AIMer</h4>
          <p>Fiat-Shamir over a proof of knowledge for an AIM2 one-way-function preimage.</p>
          <span>THIS LAB</span>
        </article>
        <article class="family-node sibling">
          <p class="node-kind">Module lattice</p>
          <h4>HAETAE</h4>
          <p>A lattice signature using a different proof and sampling strategy.</p>
          <a href="https://systemslibrarian.github.io/crypto-lab-quantum-vault-kpqc/">OPEN QUANTUM VAULT</a>
        </article>
      </section>
    </div>

    <section class="real-world" aria-labelledby="real-world-title">
      <p class="eyebrow">REAL WORLD</p>
      <h3 id="real-world-title">Korea's national post-quantum competition</h3>
      <p>KpqC selected these four as final algorithms across KEM and signature tracks. Pair this lab with Quantum Vault to exercise all four reference implementations in the browser.</p>
    </section>

    <aside class="scrutiny-note" id="set-negative-claim">
      <strong>Selection is not a proof of security.</strong>
      <p>These schemes are newer and have received less cross-implementation scrutiny than NIST's FIPS selections. The demos show specification behavior and known-answer agreement; they do not establish the underlying hardness assumptions or production readiness.</p>
    </aside>

    <section class="sources" aria-labelledby="sources-title">
      <h3 id="sources-title">Primary trails</h3>
      <ul>
        <li><a href="https://www.kpqc.or.kr/" target="_blank" rel="noopener">KpqC competition</a></li>
        <li><a href="https://github.com/ntruplus/ntruplus" target="_blank" rel="noopener">Official NTRU+ implementation and specification trail</a></li>
        <li><a href="https://github.com/killd21/kpqc-js" target="_blank" rel="noopener">Reference implementations compiled to WebAssembly and KAT gate</a></li>
      </ul>
    </section>
  `
}