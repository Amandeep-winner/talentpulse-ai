# Optimization and Contextual Bandit Engine

## Overview

TalentPulse provides programmatic campaign budget reallocation and contextual decision intelligence.
The system combines a deterministic rule-based allocation engine with multi-armed contextual bandit reinforcement learning and A/B hypothesis testing.

---

## 1. Contextual Bandit Architecture

The contextual bandit optimizes real-time bid and daily budget modification actions per publisher channel.
A separate policy is maintained per publisher channel to maximize decision efficiency and keep feature dimensional space tractable.

### 1.1 Context Vector Feature Formulation ($d = 12$)

For each decision, the environment constructs a standardized 12-dimensional feature vector $x \in \mathbb{R}^{12}$:

| Index | Feature | Dimension | Representation | Range |
|---|---|---|---|---|
| 0 | Bias Term | 1 | Intercept term | Fixed 1.0 |
| 1-5 | Job Category | 5 | One-hot vector across canonical job domains (Engineering, Data, Sales, Healthcare, Operations) | $\{0, 1\}^5$ |
| 6 | Experience Level | 1 | Normalized minimum required experience | $[0.0, 1.0]$ |
| 7 | Location Tier | 1 | Economic and market tier weighting (e.g. Tier-1 metros vs remote) | $[0.0, 1.0]$ |
| 8 | Historical CTR | 1 | Min-max scaled publisher click-through rate over 14-day rolling window | $[0.0, 1.0]$ |
| 9 | Historical CPA (Inverted) | 1 | Normalized inverse cost per application ($1 - \text{CPA}_{\text{norm}}$) where higher is more cost-efficient | $[0.0, 1.0]$ |
| 10 | Historical Conversion Rate | 1 | Application-to-interview/hire conversion rate over rolling window | $[0.0, 1.0]$ |
| 11 | Remaining Budget Fraction | 1 | Remaining campaign budget divided by total allocated budget | $[0.0, 1.0]$ |

### 1.2 Action Space ($K = 5$)

The bandit chooses among 5 discrete modification arms:

1. `increase_bid`: Adjusts publisher CPC bid upward by $+10\%$, capped at safety ceiling.
2. `decrease_bid`: Adjusts publisher CPC bid downward by $-10\%$, floored at safety floor.
3. `maintain_bid`: Keeps current CPC bid steady.
4. `increase_budget`: Adjusts publisher daily budget upward by $+10\%$.
5. `decrease_budget`: Adjusts publisher daily budget downward by $-10\%$.

### 1.3 Reward Formulation

The observed reward measures candidate pipeline quality against cost efficiency:

$$r = \frac{\text{qualifiedApplications}}{\text{ref\_qa}} - \mu \cdot \left(\frac{\text{spend}}{\text{ref\_spend}}\right)$$

Where:
- $\text{qualifiedApplications}$ is the number of vetted applicants produced by the action.
- $\text{ref\_qa}$ is the baseline benchmark volume (default 5.0).
- $\text{spend}$ is the total marketing cost incurred during the observation window.
- $\text{ref\_spend}$ is the benchmark cost baseline (default 200.0).
- $\mu$ is the spend penalty weight (default 0.5).
- The final reward $r$ is clamped to the range $[-2.0, 2.0]$ to prevent outlier feedback loops.

---

## 2. Algorithms & Linear Algebra

### 2.1 Disjoint LinUCB with Sherman-Morrison Rank-1 Updates

LinUCB models the expected payoff of each action arm $a$ as a linear combination of the context vector: $\mathbb{E}[r_{t,a} \mid x_{t}] = x_{t}^T \theta_a^*$.

For each arm $a$, the policy maintains:
- Design matrix $A_a \in \mathbb{R}^{d \times d}$, initialized to $\lambda I_d$ with regularizer $\lambda = 1.0$.
- Response vector $b_a \in \mathbb{R}^{d}$, initialized to $0$.
- Ridge regression coefficients $\hat{\theta}_a = A_a^{-1} b_a$.

#### Fast Inverse Maintenance via Sherman-Morrison Formula

Traditional ridge regression requires re-inverting $A_a$ on every step, incurring $O(d^3)$ computational cost.
TalentPulse directly maintains the inverse matrix $M_a = A_a^{-1}$ using the rank-1 Sherman-Morrison update in $O(d^2)$ time:

$$M_a^{(t)} = M_a^{(t-1)} - \frac{M_a^{(t-1)} x_t x_t^T M_a^{(t-1)}}{1 + x_t^T M_a^{(t-1)} x_t}$$

#### Arm Selection (Upper Confidence Bound)

At round $t$, LinUCB selects the arm that maximizes the upper confidence bound:

$$a_t = \arg\max_{a} \left( x_t^T \hat{\theta}_a + \alpha \sqrt{x_t^T M_a x_t} \right)$$

Where $\alpha = 0.8$ controls the exploration bonus.
The term $\sqrt{x_t^T M_a x_t}$ reflects parameter uncertainty in the feature subspace.

### 2.2 Epsilon-Greedy with Ridge Regression

As an empirical comparison baseline, the $\epsilon$-Greedy policy shares the same Sherman-Morrison linear regression estimator.
It selects the empirical greedy action with probability $1 - \epsilon_t$ and explores a uniform random arm with probability $\epsilon_t$.

The exploration probability decays smoothly over rounds:

$$\epsilon_t = \max(\epsilon_{\text{min}}, \, \epsilon_0 \cdot \gamma^t)$$

Where $\epsilon_0 = 0.10$, $\epsilon_{\text{min}} = 0.02$, and decay factor $\gamma = 0.998$.

---

## 3. A/B Testing & Hypothesis Validation

The experiments module evaluates user conversion performance between variants deterministically.

### 3.1 Deterministic Traffic Splitting

Traffic allocation assigns subjects to variants via MD5 cryptographic hashing:

$$\text{bucket} = \text{MD5}(\text{experimentId} + \text{":"} + \text{subjectKey}) \pmod{100}$$

The bucket is mapped onto cumulative variant weight intervals.
This guarantees deterministic, stable, and sticky assignment without requiring shared cache state across distributed nodes.

### 3.2 Statistical Significance (Two-Proportion Z-Test)

Let $c_1, n_1$ denote conversions and exposures for the baseline control arm.
Let $c_2, n_2$ denote conversions and exposures for the test variant.

1. **Sample Size Guard:** If $n_1 < 30$ or $n_2 < 30$, statistical testing is withheld to avoid premature stopping and false positive discovery.
2. **Pooled Conversion Rate:**
   $$p = \frac{c_1 + c_2}{n_1 + n_2}$$
3. **Standard Error:**
   $$SE = \sqrt{p (1 - p) \left(\frac{1}{n_1} + \frac{1}{n_2}\right)}$$
4. **Z-Score and P-Value:**
   $$z = \frac{\hat{p}_2 - \hat{p}_1}{SE}, \quad p\text{-value} = 2 \cdot (1 - \Phi(|z|))$$
   Where $\Phi(z)$ is computed using the Abramowitz and Stegun polynomial approximation (absolute error $< 7.5 \times 10^{-8}$).
5. **Decision:** A result is flagged statistically significant when $p\text{-value} < 0.05$.
