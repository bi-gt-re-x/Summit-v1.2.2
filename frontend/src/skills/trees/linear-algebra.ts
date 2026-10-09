/**
 * Linear Algebra — a branch of Mathematics.
 *
 * Written geometrically first and computationally second. A reader who meets
 * matrix multiplication as a rule about rows and columns can execute it and
 * cannot picture it, and everything from eigenvectors to least squares is a
 * picture before it is an arithmetic.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const LINEAR_ALGEBRA: SubjectTree = {
  id: 'linear-algebra',
  title: 'Linear Algebra',
  blurb: 'Vectors, the transformations that move them, and why so much reduces to that.',
  parent: 'mathematics',
  nodes: [
    { id: 'la.vectors', name: 'Vectors', icon: 'vectors', tier: 'foundation', core: true, state: open, percent: 15, xp: 1300,
      desc: 'A quantity with direction as well as size, and equally a list of numbers. Holding both pictures at once — arrow and list — is what makes the rest of the subject readable.' },
    { id: 'la.ops', name: 'Vector Arithmetic', icon: 'vector-add', tier: 'foundation', requires: ['la.vectors'], state: lock, percent: 0, xp: 1300,
      desc: 'Adding vectors tip to tail and scaling them longer or shorter. Every later idea is built from exactly these two moves, which is why the subject is called linear.' },
    { id: 'la.dot', name: 'Dot Product', icon: 'dot-product', tier: 'foundation', requires: ['la.ops'], state: lock, percent: 0, xp: 1500,
      desc: 'One number from two vectors, measuring how much they point the same way. Zero means perpendicular, and that single fact powers projections, similarity scores and most of graphics.' },
    { id: 'la.span', name: 'Span & Independence', icon: 'span', tier: 'beginner', core: true, requires: ['la.ops'], state: lock, percent: 0, xp: 1700,
      desc: 'Everything you can reach by combining a set of vectors, and whether one of them was redundant. Dependence is the formal version of a column that told you nothing new.' },
    { id: 'la.basis', name: 'Basis & Dimension', icon: 'basis', tier: 'beginner', requires: ['la.span'], state: lock, percent: 0, xp: 1800,
      desc: 'A minimal set of directions that reaches the whole space, and how many you need. Choosing a different basis is choosing a different set of coordinates for the same objects.' },
    { id: 'la.matrix', name: 'Matrices', icon: 'matrices', tier: 'beginner', core: true, requires: ['la.dot'], state: lock, percent: 0, xp: 1700,
      desc: 'A grid of numbers, best read as a list of what happens to each basis vector. That reading turns the multiplication rule from an arbitrary procedure into an obvious one.' },
    { id: 'la.transform', name: 'Linear Transformations', icon: 'transform', tier: 'intermediate', core: true, requires: ['la.matrix', 'la.basis'], state: lock, percent: 0, xp: 2000,
      desc: 'Functions that stretch, rotate and shear space while keeping grid lines straight and the origin fixed. A matrix is not a table of numbers; it is one of these written down.' },
    { id: 'la.compose', name: 'Composition', icon: 'compose', tier: 'intermediate', requires: ['la.transform'], state: lock, percent: 0, xp: 1700,
      desc: 'Doing one transformation after another, which is exactly what multiplying two matrices means. It explains at once why the order matters and why the product is defined so strangely.' },
    { id: 'la.systems', name: 'Systems of Equations', icon: 'equations', tier: 'intermediate', requires: ['la.matrix'], state: lock, percent: 0, xp: 1800,
      desc: 'Several linear constraints at once, read as one question: which input lands on this output. Elimination is the algorithm; the geometry is planes meeting in a point, a line, or nowhere.' },
    { id: 'la.inverse', name: 'Inverses', icon: 'inverse', tier: 'intermediate', requires: ['la.compose', 'la.systems'], state: lock, percent: 0, xp: 1900,
      desc: 'The transformation that undoes another, when one exists. It fails to exist exactly when the first one flattened the space, and that is what makes a system unsolvable rather than merely hard.' },
    { id: 'la.det', name: 'Determinant', icon: 'determinant', tier: 'intermediate', requires: ['la.transform'], state: lock, percent: 0, xp: 1800,
      desc: 'The factor by which a transformation scales area or volume, with a sign for whether it flipped. Zero means everything collapsed onto a lower dimension, which is the same zero that blocks the inverse.' },
    { id: 'la.rank', name: 'Rank & Null Space', icon: 'rank', tier: 'advanced', requires: ['la.inverse', 'la.det'], state: lock, percent: 0, xp: 2100,
      desc: 'How many dimensions survive a transformation, and everything that gets crushed to zero. Together they account for every input and answer why a solution is unique, infinite or absent.' },
    { id: 'la.project', name: 'Projections', icon: 'projection', tier: 'advanced', requires: ['la.dot', 'la.basis'], state: lock, percent: 0, xp: 2000,
      desc: 'The closest point in a subspace to a given vector — the shadow it casts. It is the whole idea behind fitting a line to points that do not lie on one.' },
    { id: 'la.ortho', name: 'Orthogonality', icon: 'orthogonal', tier: 'advanced', requires: ['la.project'], state: lock, percent: 0, xp: 2100,
      desc: 'Directions at right angles, and bases made entirely of them. They make coordinates trivial to compute and keep numerical work stable, which is why so much effort goes into constructing them.' },
    { id: 'la.lsq', name: 'Least Squares', icon: 'least-squares', tier: 'advanced', requires: ['la.project', 'la.rank'], state: lock, percent: 0, xp: 2300,
      desc: 'The best answer to a system with no exact answer, found by projecting onto what is reachable. Regression is this, and seeing that connection explains where its formula comes from.' },
    { id: 'la.eigen', name: 'Eigenvectors & Eigenvalues', icon: 'eigen', tier: 'expert', core: true, requires: ['la.det', 'la.rank'], state: lock, percent: 0, xp: 2600,
      desc: 'The directions a transformation leaves pointing the same way, and how much it stretches them. Find those and the transformation becomes a simple scaling in the right coordinates.' },
    { id: 'la.diag', name: 'Diagonalisation', icon: 'diagonal', tier: 'expert', requires: ['la.eigen', 'la.ortho'], state: lock, percent: 0, xp: 2500,
      desc: 'Rewriting a transformation in its own eigenbasis so it becomes a diagonal matrix. Applying it a thousand times then costs one exponentiation rather than a thousand multiplications.' },
    { id: 'la.svd', name: 'Singular Value Decomposition', icon: 'svd', tier: 'expert', requires: ['la.diag', 'la.lsq'], state: lock, percent: 0, xp: 2800,
      desc: 'Any matrix at all as a rotation, a stretch and another rotation. It is the most generally useful factorization there is, and the machinery under low-rank approximation and dimensionality reduction.' },
    { id: 'la.numeric', name: 'Numerical Stability', icon: 'precision', tier: 'expert', requires: ['la.ortho'], state: lock, percent: 0, xp: 2400,
      desc: 'What happens to these methods in finite-precision arithmetic, where nearly-dependent columns amplify error enormously. Conditioning tells you when an answer computed correctly is still worthless.' },
    { id: 'la.applied', name: 'Applications', icon: 'apply', tier: 'mastery', requires: ['la.svd', 'la.numeric'], state: lock, percent: 0, xp: 3000,
      desc: 'Graphics, search rankings, compression, quantum states and every neural network layer are the same handful of operations wearing different clothes. Recognizing them is what the subject is for.' },
  ],
};
