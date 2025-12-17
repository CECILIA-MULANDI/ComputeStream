module computestream::provider_registry {
  use std::string::String;
  use std::signer;

  /// Error codes
  const E_INSUFFICIENT_STAKE: u64 = 1;

  /// Minimum stake required to register (0.1 MOVE = 100000000)
  const MIN_STAKE_AMOUNT: u64 = 100000000;

  /// Provider information
  struct Provider has key, store, drop {
    wallet_address: address,
    gpu_type: String,
    vram_gb: u64,
    price_per_second: u64,
    stake_amount: u64,
    reputation_score: u64,
    is_active: bool,
  }

  /// Register or update a provider
  public entry fun register_provider(
    account: &signer,
    gpu_type: String,
    vram_gb: u64,
    price_per_second: u64,
    stake_amount: u64,
  ) acquires Provider {
    // Validate minimum stake
    assert!(stake_amount >= MIN_STAKE_AMOUNT, E_INSUFFICIENT_STAKE);

    let provider_addr = signer::address_of(account);

    // Remove old provider if exists
    if (exists<Provider>(provider_addr)) {
      let _old_provider = move_from<Provider>(provider_addr);
    };

    // Create new provider
    let provider = Provider {
      wallet_address: provider_addr,
      gpu_type,
      vram_gb,
      price_per_second,
      stake_amount,
      reputation_score: 100,
      is_active: true,
    };

    // Store provider
    move_to<Provider>(account, provider);
  }

  /// Update provider availability
  public entry fun update_availability(
    account: &signer,
    is_active: bool,
  ) acquires Provider {
    let provider_addr = signer::address_of(account);
    let provider = borrow_global_mut<Provider>(provider_addr);
    provider.is_active = is_active;
  }

  /// Update pricing
  public entry fun update_pricing(
    account: &signer,
    new_price_per_second: u64,
  ) acquires Provider {
    let provider_addr = signer::address_of(account);
    let provider = borrow_global_mut<Provider>(provider_addr);
    provider.price_per_second = new_price_per_second;
  }

  // View functions
  #[view]
  public fun get_provider(provider_addr: address): (String, u64, u64, bool, u64) acquires Provider {
    let provider = borrow_global<Provider>(provider_addr);
    (
      provider.gpu_type,
      provider.vram_gb,
      provider.price_per_second,
      provider.is_active,
      provider.reputation_score,
    )
  }

  #[view]
  public fun is_provider_active(provider_addr: address): bool acquires Provider {
    if (!exists<Provider>(provider_addr)) {
      return false
    };
    let provider = borrow_global<Provider>(provider_addr);
    provider.is_active
  }

  #[view]
  public fun get_provider_price(provider_addr: address): u64 acquires Provider {
    let provider = borrow_global<Provider>(provider_addr);
    provider.price_per_second
  }
}